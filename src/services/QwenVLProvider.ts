/**
 * FAST-Assist Studio — Qwen2.5-VL Inference Provider (RC4)
 *
 * Implements InferenceBackend using Qwen2.5-VL-7B via the OpenRouter API.
 * Exposes both the standard infer() (returns CanonicalMetadata) and the
 * richer inferFull() (returns FullInferenceResult with telemetry + raw output)
 * for the Inspector panel.
 *
 * API key: OPENROUTER_API_KEY (server-side only — never compiled into the frontend).
 * Requests are routed through /api/inference; the proxy injects the key.
 * healthCheck() makes a lightweight OPTIONS ping to confirm the proxy is reachable.
 *
 * Reliability guarantees:
 *   - 25 s hard timeout via AbortController
 *   - One automatic retry on transient failures (network errors, 429, 5xx)
 *   - Auth errors (401, 403) are NOT retried — they surface immediately
 *   - Cancellation is supported: pass an AbortSignal to inferFull()
 *   - The application never freezes: every call either resolves or throws
 *   - No unhandled promise rejections — callers (useInference) handle all throws
 *
 * Fallback behaviour is handled upstream in useInference.ts; this class only
 * throws on error, it never silently swallows failures.
 */

import type { InferenceBackend, InferenceResult, BackendType } from '@/types';
import type { FullInferenceResult, InferenceTelemetry }        from '@/types/inference';
import { parseQwenResponse }                                    from './adapters/QwenMetadataAdapter';
import { logger }                                               from '@/utils/logger';

// ─── Constants ────────────────────────────────────────────────────────────────

/** All inference requests go through the server-side proxy — never directly to OpenRouter. */
const PROXY_URL = '/api/inference';

/**
 * Model priority list — tried in order; falls back on model-not-available errors.
 * A 401/403 (auth failure) surfaces immediately without trying the next model.
 */
const MODELS = [
  'qwen/qwen2.5-vl-72b-instruct',
  'qwen/qwen2.5-vl-32b-instruct',
  'qwen/qwen2.5-vl-7b-instruct',
] as const;
type ModelId = typeof MODELS[number];

/** HTTP statuses that indicate the specific model is unavailable (try next). */
const MODEL_UNAVAILABLE_STATUSES = new Set([404, 422]);
/** HTTP status codes that warrant a single automatic retry on the same model */
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

const TIMEOUT_MS = 25_000;

/**
 * Instruction sent to the model with every frame.
 * Designed for zero-shot structured output — returns a plain JSON object,
 * no markdown fences, no prose.
 */
const USER_PROMPT = `You are a clinical FAST (Focused Assessment with Sonography for Trauma) ultrasound interpretation assistant.

Analyze the ultrasound image and respond with ONLY a JSON object matching this exact schema. No markdown fences, no prose before or after:

{
  "scan_view":   "<one of: RUQ | LUQ | Pelvis | Subxiphoid | Cardiac | Thoracic | Unknown>",
  "confidence":  <float 0.00–1.00 — your confidence in the scan_view identification>,
  "structures":  ["<visible anatomical structure>", ...],
  "quality": {
    "overall": <float 0.00–1.00 — overall image quality>,
    "motion":  "<Stable | Minor motion | Motion artifact>",
    "gain":    "<Adequate | Too high | Too low>",
    "depth":   "<Optimal | Too shallow | Too deep>"
  },
  "guidance": "<one concise sentence of probe-positioning guidance for the sonographer>"
}`;

// ─── Types ────────────────────────────────────────────────────────────────────

interface CallOptions {
  /** External AbortSignal for cooperative cancellation */
  signal?: AbortSignal;
  /** Override the default attempt count (default: 2 = one retry) */
  maxAttempts?: number;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export class QwenVLProvider implements InferenceBackend {
  readonly type: BackendType = 'rest';
  readonly label             = 'Qwen2.5-VL (OpenRouter)';

  // ── InferenceBackend interface ──────────────────────────────────────────────

  async healthCheck(): Promise<boolean> {
    // HEAD probe — the proxy returns 200 when OPENROUTER_API_KEY is set,
    // 503 when absent. Any other outcome (network error, 404, etc.) means
    // the proxy is not mounted or the server is unreachable.
    try {
      const res = await fetch(PROXY_URL, { method: 'HEAD' });
      if (res.status === 200) {
        logger.info('QwenVLProvider', `Proxy key present — provider ready (primary model: ${MODELS[0]})`);
        return true;
      }
      if (res.status === 503) {
        logger.warn('QwenVLProvider', 'Proxy returned 503 — OPENROUTER_API_KEY is not set on the server');
        return false;
      }
      logger.warn('QwenVLProvider', `Proxy health check returned unexpected status ${res.status} — treating as unavailable`);
      return false;
    } catch (err) {
      logger.warn('QwenVLProvider', 'Proxy unreachable during health check', err);
      return false;
    }
  }

  /**
   * Standard InferenceBackend entry point.
   * Calls inferFull() internally and returns only the CanonicalMetadata.
   */
  async infer(frameDataUrl: string): Promise<InferenceResult> {
    const full = await this.inferFull(frameDataUrl);
    return full.metadata;
  }

  // ── Extended API ────────────────────────────────────────────────────────────

  /**
   * Full inference call — returns telemetry, raw response, reasoning, and
   * diagnostics in addition to the canonical metadata.
   * Used by useInference to feed the Inspector panel's session log.
   *
   * Retry policy: retries once on transient failures (network errors, 429, 5xx).
   * Auth errors (401, 403) are surfaced immediately without retry.
   */
  async inferFull(
    frameDataUrl: string,
    options: CallOptions = {},
  ): Promise<FullInferenceResult> {
    const maxAttempts = options.maxAttempts ?? 2;
    let lastError: unknown;

    // Outer loop: try each model in priority order
    for (const model of MODELS) {
      // Inner loop: retry once on transient failures for this model
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const isLastAttempt = attempt === maxAttempts;
        try {
          return await this._attempt(frameDataUrl, model, options.signal);
        } catch (err) {
          lastError = err;

          // Auth failures are terminal — no point trying other models
          if (err instanceof HttpError && (err.status === 401 || err.status === 403)) {
            logger.error('QwenVLProvider', `Auth failure (${err.status}) — stopping`, err);
            throw err;
          }

          // Model unavailable — break inner loop and try next model
          if (err instanceof HttpError && MODEL_UNAVAILABLE_STATUSES.has(err.status)) {
            logger.warn('QwenVLProvider', `Model ${model} unavailable (${err.status}) — trying next`);
            break;
          }

          const isRetryable = this._isRetryable(err);
          if (isLastAttempt || !isRetryable) {
            logger.error(
              'QwenVLProvider',
              `Inference failed on ${model} (attempt ${attempt}/${maxAttempts})${isRetryable ? ' — no more retries' : ' — non-retryable'}`,
              err,
            );
            // Non-retryable non-model error: break inner, try next model as last resort
            break;
          }

          const delayMs = 500 * attempt;
          logger.warn(
            'QwenVLProvider',
            `Transient failure on ${model} (attempt ${attempt}/${maxAttempts}) — retrying in ${delayMs} ms`,
            err,
          );
          await delay(delayMs);
        }
      }
    }

    // All models exhausted
    throw lastError ?? new Error('QwenVLProvider: all models exhausted without a result');
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /** Execute a single HTTP attempt with its own AbortController + timeout. */
  private async _attempt(
    frameDataUrl: string,
    model: ModelId,
    externalSignal?: AbortSignal,
  ): Promise<FullInferenceResult> {
    const requestTs  = Date.now();
    const controller = new AbortController();

    // Combine our timeout with any caller-supplied signal
    const timeoutId = setTimeout(() => controller.abort(new Error(`Timeout after ${TIMEOUT_MS} ms`)), TIMEOUT_MS);
    externalSignal?.addEventListener('abort', () => controller.abort(externalSignal.reason), { once: true });

    try {
      const response = await fetch(PROXY_URL, {
        method:  'POST',
        signal:  controller.signal,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens:  600,
          temperature: 0.05, // near-deterministic for structured output
          messages: [{
            role:    'user',
            content: [
              {
                type:      'image_url',
                image_url: { url: frameDataUrl },
              },
              {
                type: 'text',
                text: USER_PROMPT,
              },
            ],
          }],
        }),
      });

      const responseTs = Date.now();
      const wallTimeMs = responseTs - requestTs;

      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        const err = new HttpError(response.status, errBody.slice(0, 300));
        logger.warn('QwenVLProvider', `HTTP ${response.status} after ${wallTimeMs} ms`, errBody.slice(0, 200));
        throw err;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json      = await response.json() as any;
      const rawText: string = json?.choices?.[0]?.message?.content ?? '';

      const usage         = json?.usage ?? {};
      const promptTokens: number | undefined  = usage.prompt_tokens;
      const completTokens: number | undefined = usage.completion_tokens;

      const { metadata, reasoning, diagnostics } = parseQwenResponse(rawText, requestTs);
      metadata.backend_latency = wallTimeMs;

      const telemetry: InferenceTelemetry = {
        requestTs,
        responseTs,
        wallTimeMs,
        provider:    'qwen-vl',
        model,
        promptTokens,
        completTokens,
      };

      logger.debug(
        'QwenVLProvider',
        `OK — ${wallTimeMs} ms | view=${metadata.scan_view} | conf=${metadata.confidence.toFixed(2)} | tokens=${completTokens ?? '?'}`,
      );

      return { metadata, telemetry, rawResponse: rawText, reasoning, diagnostics };

    } catch (err) {
      const wallTimeMs = Date.now() - requestTs;
      if (err instanceof Error && err.name === 'AbortError') {
        const msg = externalSignal?.aborted
          ? 'Inference cancelled by caller'
          : `Inference timed out after ${wallTimeMs} ms`;
        throw new Error(msg);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /** Returns true if the error warrants a single automatic retry. */
  private _isRetryable(err: unknown): boolean {
    if (err instanceof HttpError) {
      // Auth errors are non-retryable — retrying won't fix them
      if (err.status === 401 || err.status === 403) return false;
      return RETRYABLE_STATUSES.has(err.status);
    }
    // Network errors, timeouts, etc. are retryable
    // Abort triggered by the external caller (not our timeout) is non-retryable
    if (err instanceof Error) {
      if (err.message.includes('cancelled by caller')) return false;
    }
    return true;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Tagged HTTP error carrying the status code for retry decisions. */
class HttpError extends Error {
  constructor(
    readonly status: number,
    body: string,
  ) {
    super(`OpenRouter HTTP ${status}: ${body}`);
    this.name = 'HttpError';
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

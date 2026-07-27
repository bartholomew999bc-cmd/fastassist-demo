/**
 * FAST-Assist Studio — Qwen2.5-VL Inference Provider (RC3)
 *
 * Implements InferenceBackend using Qwen2.5-VL-7B via the OpenRouter API.
 * Exposes both the standard infer() (returns CanonicalMetadata) and the
 * richer inferFull() (returns FullInferenceResult with telemetry + raw output)
 * for the Inspector panel.
 *
 * API key: VITE_OPENROUTER_API_KEY (Replit Secret, build-time env var).
 * healthCheck() returns false when the key is absent — no API quota consumed.
 *
 * Fallback behaviour is handled upstream in useInference.ts; this class only
 * throws on error, it never silently swallows failures.
 */

import type { InferenceBackend, InferenceResult, BackendType } from '@/types';
import type { FullInferenceResult, InferenceTelemetry }        from '@/types/inference';
import { parseQwenResponse }                                    from './adapters/QwenMetadataAdapter';
import { logger }                                               from '@/utils/logger';

// ─── Constants ────────────────────────────────────────────────────────────────

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL          = 'qwen/qwen2.5-vl-7b-instruct:free';
const TIMEOUT_MS     = 25_000;

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

// ─── Provider ─────────────────────────────────────────────────────────────────

export class QwenVLProvider implements InferenceBackend {
  readonly type: BackendType = 'rest';
  readonly label             = 'Qwen2.5-VL (OpenRouter)';

  private readonly apiKey: string;

  constructor() {
    this.apiKey = import.meta.env.VITE_OPENROUTER_API_KEY ?? '';
  }

  // ── InferenceBackend interface ──────────────────────────────────────────────

  async healthCheck(): Promise<boolean> {
    if (!this.apiKey) {
      logger.warn('QwenVLProvider', 'VITE_OPENROUTER_API_KEY is not set — hosted AI unavailable');
      return false;
    }
    // Key-presence check only — calling the API just to health-check would
    // burn quota and add ~1–2 s latency on every init.
    logger.info('QwenVLProvider', `API key present — provider ready (model: ${MODEL})`);
    return true;
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
   */
  async inferFull(frameDataUrl: string): Promise<FullInferenceResult> {
    if (!this.apiKey) {
      throw new Error('VITE_OPENROUTER_API_KEY is not configured — cannot call hosted AI');
    }

    const requestTs  = Date.now();
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(OPENROUTER_URL, {
        method:  'POST',
        signal:  controller.signal,
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer':  typeof window !== 'undefined' ? window.location.origin : 'https://fast-assist.replit.app',
          'X-Title':       'FAST-Assist Studio',
        },
        body: JSON.stringify({
          model:       MODEL,
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

      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        throw new Error(`OpenRouter HTTP ${response.status}: ${errBody.slice(0, 300)}`);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json   = await response.json() as any;
      const rawText: string = json?.choices?.[0]?.message?.content ?? '';

      const usage         = json?.usage ?? {};
      const promptTokens: number | undefined  = usage.prompt_tokens;
      const completTokens: number | undefined = usage.completion_tokens;

      const wallTimeMs = responseTs - requestTs;

      const { metadata, reasoning, diagnostics } = parseQwenResponse(rawText, requestTs);
      metadata.backend_latency = wallTimeMs;

      const telemetry: InferenceTelemetry = {
        requestTs,
        responseTs,
        wallTimeMs,
        provider:    'qwen-vl',
        model:       MODEL,
        promptTokens,
        completTokens,
      };

      logger.debug(
        'QwenVLProvider',
        `OK — ${wallTimeMs}ms | view=${metadata.scan_view} | conf=${metadata.confidence.toFixed(2)} | tokens=${completTokens ?? '?'}`,
      );

      return { metadata, telemetry, rawResponse: rawText, reasoning, diagnostics };

    } catch (err) {
      const wallTimeMs = Date.now() - requestTs;
      logger.error('QwenVLProvider', `Inference failed after ${wallTimeMs}ms`, err);
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

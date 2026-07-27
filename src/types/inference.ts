/**
 * FAST-Assist Studio — Extended Inference Types (RC3)
 *
 * These types carry the full "rich" result from a hosted AI provider,
 * including telemetry, raw model output, reasoning, and diagnostics.
 *
 * The workflow layer only ever touches CanonicalMetadata (= InferenceResult).
 * The Inspector panel uses FullInferenceResult for developer visibility.
 */

import type { InferenceResult } from './index';

/**
 * CanonicalMetadata is the exact shape the workflow consumes.
 * It is intentionally identical to InferenceResult — adapter implementations
 * must produce this shape regardless of model or API provider.
 */
export type CanonicalMetadata = InferenceResult;

/** Telemetry collected around each hosted inference call. */
export interface InferenceTelemetry {
  /** Epoch ms when the HTTP request was dispatched. */
  requestTs:      number;
  /** Epoch ms when the HTTP response was received. */
  responseTs:     number;
  /** Total round-trip wall time in ms. */
  wallTimeMs:     number;
  /** Human-readable provider identifier, e.g. 'qwen-vl'. */
  provider:       string;
  /** Model identifier, e.g. 'qwen/qwen2.5-vl-7b-instruct:free'. */
  model?:         string;
  /** Prompt token count (if reported by the API). */
  promptTokens?:  number;
  /** Completion token count (if reported by the API). */
  completTokens?: number;
}

/**
 * Full inference result from a hosted AI provider.
 * The `metadata` field is what the workflow receives.
 * All other fields are inspector-only.
 */
export interface FullInferenceResult {
  /** Parsed, normalised metadata — the only part the workflow cares about. */
  metadata:     CanonicalMetadata;
  /** Call telemetry — latency, provider, model, token counts. */
  telemetry:    InferenceTelemetry;
  /** Raw text content from the model response before parsing. */
  rawResponse?: string;
  /** Chain-of-thought / <think> block extracted from the response, if present. */
  reasoning?:   string;
  /** Human-readable parse warnings or errors, if any. */
  diagnostics?: string;
}

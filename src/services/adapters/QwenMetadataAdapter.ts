/**
 * FAST-Assist Studio — Qwen VL Metadata Adapter
 *
 * Pure transform: raw Qwen2.5-VL text response → CanonicalMetadata.
 * No side-effects, no UI references, no Zustand imports.
 *
 * Handles:
 *  - JSON embedded in markdown code fences (```json … ```)
 *  - Raw JSON objects in prose
 *  - <think>…</think> chain-of-thought blocks (stripped before parsing)
 *  - Malformed / partial JSON (returns safe fallback with diagnostics note)
 */

import type { CanonicalMetadata } from '@/types/inference';
import type { ImageQuality }      from '@/types';
import { logger }                  from '@/utils/logger';

// ─── Accepted scan-view values ────────────────────────────────────────────────

const SCAN_VIEWS = new Set([
  'RUQ', 'LUQ', 'Pelvis', 'Subxiphoid', 'Cardiac', 'Thoracic', 'FAST', 'Unknown',
]);

// ─── Safe defaults ────────────────────────────────────────────────────────────

const FALLBACK_QUALITY: ImageQuality = {
  overall: 0.5,
  motion:  'Stable',
  gain:    'Adequate',
  depth:   'Optimal',
};

// ─── Extraction helpers ───────────────────────────────────────────────────────

/** Strip <think>…</think> blocks and return the clean remainder. */
function stripReasoning(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

/** Extract the first <think>…</think> block content, if present. */
export function extractReasoning(text: string): string | undefined {
  const m = text.match(/<think>([\s\S]*?)<\/think>/i);
  return m ? m[1].trim() : undefined;
}

/**
 * Extract the first JSON object from text that may contain markdown fences,
 * prose, or reasoning blocks.  Returns null if nothing found.
 */
function extractJson(text: string): string | null {
  const clean = stripReasoning(text);

  // JSON inside a code fence
  const fence = clean.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) return fence[1].trim();

  // Bare JSON object (first { … } that spans a significant chunk)
  const obj = clean.match(/\{[\s\S]*\}/);
  if (obj) return obj[0];

  return null;
}

// ─── Normalisation helpers ────────────────────────────────────────────────────

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function normaliseQuality(raw: unknown): ImageQuality {
  if (!raw || typeof raw !== 'object') return { ...FALLBACK_QUALITY };
  const q = raw as Record<string, unknown>;
  return {
    overall: typeof q.overall === 'number' ? clamp01(q.overall) : 0.5,
    motion:  typeof q.motion  === 'string' ? q.motion            : 'Stable',
    gain:    typeof q.gain    === 'string' ? q.gain              : 'Adequate',
    depth:   typeof q.depth   === 'string' ? q.depth             : 'Optimal',
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface AdapterResult {
  metadata:    CanonicalMetadata;
  reasoning?:  string;
  diagnostics?: string;
}

/**
 * Parse the raw text content from a Qwen2.5-VL response into
 * CanonicalMetadata.  Always returns a valid (possibly fallback) result.
 *
 * @param rawText   - The `choices[0].message.content` string from the API.
 * @param requestTs - Epoch ms timestamp to stamp on the result.
 */
export function parseQwenResponse(rawText: string, requestTs: number): AdapterResult {
  const reasoning = extractReasoning(rawText);
  const jsonStr   = extractJson(rawText);

  if (!jsonStr) {
    logger.warn('QwenAdapter', 'No JSON block found in model response', rawText.slice(0, 300));
    return {
      metadata:    makeFallback(requestTs),
      reasoning,
      diagnostics: 'No JSON block found in model response.',
    };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr) as Record<string, unknown>;
  } catch (err) {
    logger.warn('QwenAdapter', 'JSON parse error', { snippet: jsonStr.slice(0, 300), err });
    return {
      metadata:    makeFallback(requestTs),
      reasoning,
      diagnostics: `JSON parse error: ${String(err)}`,
    };
  }

  const scan_view = SCAN_VIEWS.has(String(parsed.scan_view ?? ''))
    ? String(parsed.scan_view)
    : 'Unknown';

  const confidence = typeof parsed.confidence === 'number'
    ? clamp01(parsed.confidence)
    : 0.5;

  const structures = Array.isArray(parsed.structures)
    ? (parsed.structures as unknown[]).filter((s): s is string => typeof s === 'string')
    : [];

  const guidance = typeof parsed.guidance === 'string' ? parsed.guidance : '';

  const metadata: CanonicalMetadata = {
    timestamp:      requestTs,
    scan_view,
    confidence,
    structures,
    quality:        normaliseQuality(parsed.quality),
    guidance,
    backend_latency: 0, // filled in by QwenVLProvider after timing
  };

  return { metadata, reasoning };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function makeFallback(ts: number): CanonicalMetadata {
  return {
    timestamp:      ts,
    scan_view:      'Unknown',
    confidence:     0.3,
    structures:     [],
    quality:        { ...FALLBACK_QUALITY },
    guidance:       'Unable to parse AI response. Check the Inspector panel for details.',
    backend_latency: 0,
  };
}

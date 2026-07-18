/**
 * FAST-Assist Studio — Signal Smoothing Utilities
 *
 * Exponential moving average to prevent jitter in confidence displays.
 */

/**
 * Exponential moving average: smooth = alpha * newValue + (1 - alpha) * previous
 * @param alpha  Smoothing factor 0–1. Lower = more smoothing. Higher = more reactive.
 */
export function ema(previous: number, next: number, alpha: number): number {
  return alpha * next + (1 - alpha) * previous;
}

/** Clamp a value between min and max */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Format latency as a human-readable string */
export function formatLatency(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

/** Format a 0–1 confidence value as a percentage string */
export function formatConfidence(value: number): string {
  return `${Math.round(clamp(value, 0, 1) * 100)}%`;
}

/** Format bytes to human-readable */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

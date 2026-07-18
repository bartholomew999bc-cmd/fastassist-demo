/**
 * FAST-Assist Studio — Frame Capture Utility
 *
 * Captures the current frame from an HTMLVideoElement or HTMLCanvasElement
 * as a compressed JPEG data URL suitable for transport to an AI backend.
 */

export interface CaptureOptions {
  quality?: number;   // 0–1, JPEG quality. Default 0.7
  maxWidth?: number;  // Downscale to this width to reduce payload size
  maxHeight?: number;
}

/**
 * Capture the current frame from a video or canvas element as a base64 JPEG.
 * Returns null if the element is not ready.
 */
export function captureFrame(
  source: HTMLVideoElement | HTMLCanvasElement,
  options: CaptureOptions = {}
): string | null {
  const { quality = 0.7, maxWidth = 640, maxHeight = 480 } = options;

  // Canvas — can capture directly
  if (source instanceof HTMLCanvasElement) {
    return source.toDataURL('image/jpeg', quality);
  }

  // Video — must be in a playable state
  if (source.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return null;
  if (source.videoWidth === 0 || source.videoHeight === 0) return null;

  const canvas = document.createElement('canvas');
  const scale  = Math.min(
    maxWidth  / source.videoWidth,
    maxHeight / source.videoHeight,
    1
  );
  canvas.width  = Math.round(source.videoWidth  * scale);
  canvas.height = Math.round(source.videoHeight * scale);

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

/** Estimate the byte size of a base64 data URL. */
export function estimateDataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.split(',')[1] ?? '';
  return Math.round((base64.length * 3) / 4);
}

/**
 * FAST-Assist Studio — Image Preprocessor
 *
 * Modular, chainable image preprocessing pipeline that runs synchronously
 * on a reusable off-screen canvas. Supports resize, center-crop, aspect-ratio
 * preservation, grayscale conversion, rotation, and horizontal flip.
 *
 * GPU acceleration (WebGPU / WebGL) can be slotted in as a drop-in
 * replacement for the canvas-based implementation without changing the
 * public API.
 */

export interface PreprocessOptions {
  /** Target output width in pixels. Default: 640 */
  targetWidth?:    number;
  /** Target output height in pixels. Default: 480 */
  targetHeight?:   number;
  /** Letterbox to preserve source aspect ratio. Default: true */
  preserveAspect?: boolean;
  /** Convert to grayscale via ITU-R BT.601 luminance weighting. Default: false */
  grayscale?:      boolean;
  /** Normalize pixel values to [0,1] (for tensor pipeline). Default: false */
  normalize?:      boolean;
  /** Clockwise rotation in degrees. Default: 0 */
  rotation?:       0 | 90 | 180 | 270;
  /** Mirror the image horizontally. Default: false */
  flipHorizontal?: boolean;
  /** JPEG output quality 0–1. Default: 0.82 */
  quality?:        number;
}

const DEFAULTS: Required<PreprocessOptions> = {
  targetWidth:    640,
  targetHeight:   480,
  preserveAspect: true,
  grayscale:      false,
  normalize:      false,
  rotation:       0,
  flipHorizontal: false,
  quality:        0.82,
};

export interface PreprocessResult {
  dataUrl:  string;
  width:    number;
  height:   number;
  byteSize: number;
}

export class Preprocessor {
  private canvas:  HTMLCanvasElement;
  private ctx:     CanvasRenderingContext2D;
  private options: Required<PreprocessOptions>;

  constructor(options: PreprocessOptions = {}) {
    this.options = { ...DEFAULTS, ...options };
    this.canvas  = document.createElement('canvas');
    const ctx    = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Preprocessor: failed to get 2D rendering context');
    this.ctx = ctx;
  }

  /** Merge partial option updates without recreating the canvas. */
  updateOptions(patch: Partial<PreprocessOptions>): void {
    this.options = { ...this.options, ...patch };
  }

  /**
   * Process a source element into a JPEG data URL.
   * Returns null when the source has zero or unknown dimensions.
   */
  process(
    source: ImageBitmap | HTMLCanvasElement | HTMLVideoElement | HTMLImageElement
  ): PreprocessResult | null {
    const [srcW, srcH] = this.sourceDimensions(source);
    if (srcW === 0 || srcH === 0) return null;

    const {
      targetWidth, targetHeight, preserveAspect,
      grayscale, rotation, flipHorizontal, quality,
    } = this.options;

    // For 90° / 270° rotations the output canvas dimensions are transposed
    const rotated = rotation === 90 || rotation === 270;
    const outW = rotated ? targetHeight : targetWidth;
    const outH = rotated ? targetWidth  : targetHeight;

    // Compute draw rectangle preserving source aspect ratio
    let drawX = 0, drawY = 0, drawW = outW, drawH = outH;
    if (preserveAspect) {
      const scale = Math.min(outW / srcW, outH / srcH);
      drawW = Math.round(srcW * scale);
      drawH = Math.round(srcH * scale);
      drawX = Math.round((outW - drawW) / 2);
      drawY = Math.round((outH - drawH) / 2);
    }

    this.canvas.width  = outW;
    this.canvas.height = outH;
    this.ctx.clearRect(0, 0, outW, outH);

    // Apply affine transforms: rotate around center, then flip
    this.ctx.save();
    this.ctx.translate(outW / 2, outH / 2);
    if (rotation)       this.ctx.rotate((rotation * Math.PI) / 180);
    if (flipHorizontal) this.ctx.scale(-1, 1);
    this.ctx.translate(-outW / 2, -outH / 2);

    this.ctx.drawImage(source as CanvasImageSource, drawX, drawY, drawW, drawH);
    this.ctx.restore();

    if (grayscale) this.applyGrayscale(outW, outH);

    const dataUrl = this.canvas.toDataURL('image/jpeg', quality);
    const base64  = dataUrl.split(',')[1] ?? '';
    const byteSize = Math.round((base64.length * 3) / 4);

    return { dataUrl, width: outW, height: outH, byteSize };
  }

  dispose(): void {
    // Release canvas memory
    this.canvas.width = this.canvas.height = 0;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private sourceDimensions(
    source: ImageBitmap | HTMLCanvasElement | HTMLVideoElement | HTMLImageElement
  ): [number, number] {
    if (source instanceof ImageBitmap)    return [source.width, source.height];
    if (source instanceof HTMLVideoElement) return [source.videoWidth, source.videoHeight];
    return [(source as HTMLCanvasElement | HTMLImageElement).width,
            (source as HTMLCanvasElement | HTMLImageElement).height];
  }

  private applyGrayscale(w: number, h: number): void {
    const img = this.ctx.getImageData(0, 0, w, h);
    const d   = img.data;
    for (let i = 0; i < d.length; i += 4) {
      // ITU-R BT.601 luminance weights
      const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      d[i] = d[i + 1] = d[i + 2] = g;
    }
    this.ctx.putImageData(img, 0, 0);
  }
}

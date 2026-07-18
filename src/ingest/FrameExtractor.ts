/**
 * FAST-Assist Studio — Frame Extractor
 *
 * Drives the frame-capture loop at native display rate using
 * requestVideoFrameCallback (rVFC) where supported, falling back to
 * requestAnimationFrame (rAF) for canvas elements and older browsers.
 *
 * On each tick the extractor:
 *   1. Queries the active DOM element (#fast-assist-video)
 *   2. Captures pixel data (ImageBitmap if available, canvas otherwise)
 *   3. Runs the Preprocessor to produce a JPEG data URL
 *   4. Invokes the registered onFrame callback
 *   5. Updates rolling FPS / latency diagnostics
 *
 * All rVFC / rAF handles are cancelled cleanly on stop().
 */

import { Preprocessor } from './Preprocessor';
import type { ProcessedFrame, FrameMetadata } from './IVideoSource';

// ── TypeScript declaration for requestVideoFrameCallback ─────────────────────
// Not yet in lib.dom.d.ts as of TS 5.x — declare locally.
interface VideoFrameCallbackMetadata {
  captureTime?:        DOMHighResTimeStamp;
  presentationTime:    DOMHighResTimeStamp;
  presentedFrames:     number;
  mediaTime:           number;
  expectedDisplayTime: DOMHighResTimeStamp;
  width:               number;
  height:              number;
  processingDuration?: number;
}

interface HTMLVideoElementRVFC extends HTMLVideoElement {
  requestVideoFrameCallback(
    callback: (now: DOMHighResTimeStamp, metadata: VideoFrameCallbackMetadata) => void
  ): number;
  cancelVideoFrameCallback(handle: number): void;
}

// ── Diagnostics snapshot ──────────────────────────────────────────────────────

export interface ExtractorDiagnostics {
  extractedTotal:     number;
  droppedTotal:       number;
  outputFps:          number;
  avgExtractionMs:    number;
  peakExtractionMs:   number;
  useRVFC:            boolean;
  elementType:        'video' | 'canvas' | 'img' | 'none';
}

// ── Callback type ─────────────────────────────────────────────────────────────

export type FrameExtractedCallback = (frame: ProcessedFrame) => void;

// ── Main class ────────────────────────────────────────────────────────────────

export class FrameExtractor {
  private preprocessor: Preprocessor;
  private onFrameCb:    FrameExtractedCallback;

  private running     = false;
  private rvfcHandle: number | null = null;
  private rafHandle:  number | null = null;

  // FPS tracking — rolling 60-frame window
  private fpsTimestamps: number[] = [];
  private readonly FPS_WINDOW = 60;

  // Diagnostics counters
  private extracted    = 0;
  private dropped      = 0;
  private sumExtractMs = 0;
  private peakExtractMs = 0;

  // Frame counter shared across all captures this session
  private frameCounter = 0;

  // Support detection (cached once)
  private static readonly HAS_RVFC = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;

  constructor(preprocessor: Preprocessor, onFrame: FrameExtractedCallback) {
    this.preprocessor = preprocessor;
    this.onFrameCb    = onFrame;
  }

  /** Begin the extraction loop. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.scheduleNext(performance.now(), null);
  }

  /** Stop the extraction loop and cancel all pending handles. */
  stop(): void {
    this.running = false;
    this.cancelHandles();
  }

  get isRunning(): boolean { return this.running; }

  /** Replace the preprocessor (e.g. when options change). */
  setPreprocessor(p: Preprocessor): void { this.preprocessor = p; }

  diagnostics(): ExtractorDiagnostics {
    const now  = performance.now();
    const recent = this.fpsTimestamps.filter(t => now - t < 1000);
    return {
      extractedTotal:   this.extracted,
      droppedTotal:     this.dropped,
      outputFps:        recent.length,
      avgExtractionMs:  this.extracted > 0
        ? Math.round(this.sumExtractMs / this.extracted) : 0,
      peakExtractionMs: Math.round(this.peakExtractionMs),
      useRVFC:          FrameExtractor.HAS_RVFC,
      elementType:      this.classifyElement(),
    };
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private scheduleNext(now: DOMHighResTimeStamp, rvfcMeta: VideoFrameCallbackMetadata | null): void {
    if (!this.running) return;

    const el = this.queryElement();

    if (el instanceof HTMLVideoElement && FrameExtractor.HAS_RVFC) {
      // rVFC: fires exactly when a new decoded frame is ready for display
      this.rvfcHandle = (el as HTMLVideoElementRVFC).requestVideoFrameCallback(
        (t, meta) => this.onRVFC(t, meta)
      );
    } else {
      // rAF fallback: fires on next display refresh (~60fps)
      this.rafHandle = requestAnimationFrame((t) => this.onRAF(t));
    }
  }

  private onRVFC(now: DOMHighResTimeStamp, meta: VideoFrameCallbackMetadata): void {
    if (!this.running) return;
    this.extract(now, meta);
    this.scheduleNext(now, meta);
  }

  private onRAF(now: DOMHighResTimeStamp): void {
    if (!this.running) return;
    this.extract(now, null);
    this.scheduleNext(now, null);
  }

  private extract(now: DOMHighResTimeStamp, rvfcMeta: VideoFrameCallbackMetadata | null): void {
    const el = this.queryElement();
    if (!el) { this.dropped++; return; }

    const t0 = performance.now();

    // Try ImageBitmap first (zero-copy path, no canvas allocation)
    // createImageBitmap is async so we fall through to synchronous canvas
    const result = this.captureSync(el, now, rvfcMeta);
    if (!result) { this.dropped++; return; }

    const extractMs = performance.now() - t0;
    this.sumExtractMs   += extractMs;
    this.peakExtractMs   = Math.max(this.peakExtractMs, extractMs);
    this.extracted++;

    // Rolling FPS window
    this.fpsTimestamps.push(now);
    if (this.fpsTimestamps.length > this.FPS_WINDOW) this.fpsTimestamps.shift();

    try { this.onFrameCb(result); } catch { /* isolate callback errors */ }
  }

  /** Synchronous canvas-based capture with optional rVFC geometry hints. */
  private captureSync(
    el: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
    now: DOMHighResTimeStamp,
    rvfcMeta: VideoFrameCallbackMetadata | null,
  ): ProcessedFrame | null {
    // Validate element readiness
    if (el instanceof HTMLVideoElement) {
      if (el.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return null;
      if (el.videoWidth === 0 || el.videoHeight === 0) return null;
    } else if (el instanceof HTMLImageElement) {
      if (!el.complete || el.naturalWidth === 0) return null;
    } else {
      // Canvas — always ready
    }

    const srcW = this.elementWidth(el);
    const srcH = this.elementHeight(el);
    if (srcW === 0 || srcH === 0) return null;

    const preprocessed = this.preprocessor.process(el as HTMLVideoElement);
    if (!preprocessed || !preprocessed.dataUrl) return null;

    const videoTs = el instanceof HTMLVideoElement
      ? Math.round(el.currentTime * 1000) : null;

    const metadata: FrameMetadata = {
      frameId:             `fe-${++this.frameCounter}`,
      frameNumber:         this.frameCounter,
      sourceTimestamp:     rvfcMeta?.presentationTime ?? now,
      processingTimestamp: Date.now(),
      videoTimestamp:      videoTs,
      sourceName:          el.id || 'fast-assist-video',
      resolution:          { width: srcW, height: srcH },
      sourceFps:           this.computeCurrentFps(),
    };

    return {
      dataUrl:  preprocessed.dataUrl,
      metadata,
      byteSize: preprocessed.byteSize,
    };
  }

  private computeCurrentFps(): number {
    const now    = performance.now();
    const recent = this.fpsTimestamps.filter(t => now - t < 1000);
    return recent.length;
  }

  private queryElement(): HTMLVideoElement | HTMLCanvasElement | HTMLImageElement | null {
    return document.getElementById('fast-assist-video') as
      HTMLVideoElement | HTMLCanvasElement | HTMLImageElement | null;
  }

  private elementWidth(el: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement): number {
    if (el instanceof HTMLVideoElement) return el.videoWidth;
    if (el instanceof HTMLImageElement) return el.naturalWidth;
    return el.width;
  }

  private elementHeight(el: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement): number {
    if (el instanceof HTMLVideoElement) return el.videoHeight;
    if (el instanceof HTMLImageElement) return el.naturalHeight;
    return el.height;
  }

  private classifyElement(): 'video' | 'canvas' | 'img' | 'none' {
    const el = this.queryElement();
    if (!el) return 'none';
    if (el instanceof HTMLVideoElement)  return 'video';
    if (el instanceof HTMLCanvasElement) return 'canvas';
    return 'img';
  }

  private cancelHandles(): void {
    const el = this.queryElement();
    if (this.rvfcHandle !== null && el instanceof HTMLVideoElement && FrameExtractor.HAS_RVFC) {
      (el as HTMLVideoElementRVFC).cancelVideoFrameCallback(this.rvfcHandle);
      this.rvfcHandle = null;
    }
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
  }
}

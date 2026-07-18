/**
 * FAST-Assist Studio — MJPEG Stream Source
 *
 * Reads a Motion JPEG stream via the Fetch API (multipart/x-mixed-replace).
 * Falls back to rendering via an <img> element if CORS prevents canvas reads.
 *
 * Supports: reconnect on timeout/network error, configurable timeout detection.
 *
 * Stream URL example: http://host:8080/video
 */

import type {
  IVideoSource, SourceKind, SourceStatus, PlaybackState,
  SourceMetadata, SourceCapabilities, RawFrame,
  FrameCallback, ErrorCallback, DisconnectCallback, FrameMetadata,
} from '../IVideoSource';
import { logger } from '@/utils/logger';

export interface MJPEGConfig {
  url:              string;
  /** Abort and reconnect if no frame received for this many ms. Default: 10 000 */
  timeoutMs?:       number;
  /** Max automatic reconnect attempts. Default: 10 */
  maxReconnects?:   number;
  /** Delay between reconnect attempts in ms. Default: 2000 */
  reconnectDelayMs?: number;
}

let _frameCounter = 0;

export class MJPEGSource implements IVideoSource {
  readonly kind:  SourceKind = 'mjpeg';
  readonly label: string;

  private config:       MJPEGConfig;
  private _status:      SourceStatus  = 'idle';
  private _playback:    PlaybackState = 'idle';
  private _frameNum:    number        = 0;
  private _reconnects:  number        = 0;
  private _lastError:   string | null = null;

  private abortCtrl:     AbortController | null = null;
  private timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  private latestJpeg:    Uint8Array | null = null;
  private latestCanvas:  HTMLCanvasElement | null = null;
  private disposed      = false;

  private frameCbs:      FrameCallback[]      = [];
  private errorCbs:      ErrorCallback[]      = [];
  private disconnectCbs: DisconnectCallback[] = [];

  constructor(config: MJPEGConfig) {
    this.config = {
      timeoutMs: 10_000, maxReconnects: 10, reconnectDelayMs: 2000,
      ...config,
    };
    this.label = `MJPEG: ${config.url}`;
  }

  async initialize(): Promise<void> {
    if (!this.config.url) throw new Error('MJPEGSource: url is required');
    this._status = 'connecting';
  }

  async connect(): Promise<void> {
    await this.openStream();
  }

  start(): void {
    this._status   = 'playing';
    this._playback = 'playing';
  }

  pause(): void {
    this._playback = 'paused';
    this._status   = 'paused';
  }

  resume(): void {
    this._status   = 'playing';
    this._playback = 'playing';
  }

  stop(): void {
    this.abortCtrl?.abort();
    this.abortCtrl = null;
    this.clearTimeout();
    this._status   = 'stopped';
    this._playback = 'stopped';
  }

  disconnect(): void {
    this.stop();
    this._status = 'disconnected';
    for (const cb of this.disconnectCbs) cb('manual disconnect');
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
    this.latestJpeg   = null;
    this.latestCanvas = null;
    this.frameCbs      = [];
    this.errorCbs      = [];
    this.disconnectCbs = [];
  }

  getFrame(): RawFrame | null {
    if (this._playback !== 'playing' || !this.latestCanvas) return null;
    const canvas = document.createElement('canvas');
    canvas.width  = this.latestCanvas.width;
    canvas.height = this.latestCanvas.height;
    canvas.getContext('2d')?.drawImage(this.latestCanvas, 0, 0);
    return {
      data: canvas,
      metadata: this.buildMeta(canvas.width, canvas.height),
    };
  }

  getUrl(): string { return this.config.url; }

  getMetadata(): SourceMetadata {
    return {
      kind:              this.kind,
      label:             this.label,
      resolution:        this.latestCanvas
        ? { width: this.latestCanvas.width, height: this.latestCanvas.height }
        : null,
      durationSecs:      null,
      fps:               null,
      codec:             'MJPEG',
      bitrateBps:        null,
      status:            this._status,
      playbackState:     this._playback,
      reconnectAttempts: this._reconnects,
      lastError:         this._lastError,
    };
  }

  getCapabilities(): SourceCapabilities {
    return {
      canPause: false, canSeek: false, canChangeSpeed: false,
      canChangeResolution: false, hasAudio: false,
      supportsLoop: false, maxFps: 30,
    };
  }

  getStatus(): SourceStatus { return this._status; }

  onFrame(cb: FrameCallback):           void { this.frameCbs.push(cb); }
  onError(cb: ErrorCallback):           void { this.errorCbs.push(cb); }
  onDisconnect(cb: DisconnectCallback): void { this.disconnectCbs.push(cb); }

  // ── Private ────────────────────────────────────────────────────────────────

  private async openStream(): Promise<void> {
    this.abortCtrl = new AbortController();
    this.resetTimeout();

    try {
      const resp = await fetch(this.config.url, {
        signal: this.abortCtrl.signal,
        cache: 'no-store',
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status} from ${this.config.url}`);
      if (!resp.body) throw new Error('Response has no body');

      const contentType = resp.headers.get('content-type') ?? '';
      const boundary    = this.extractBoundary(contentType);

      this._status  = 'connected';
      this._playback = 'playing';
      logger.info('MJPEGSource', `Streaming from ${this.config.url} (boundary: ${boundary ?? 'unknown'})`);

      await this.readMJPEGStream(resp.body);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      this._lastError = (err as Error).message;
      this._status    = 'error';
      logger.warn('MJPEGSource', 'Stream error', err);
      this.scheduleReconnect();
    }
  }

  /** Parse multipart/x-mixed-replace stream and decode JPEG frames. */
  private async readMJPEGStream(body: ReadableStream<Uint8Array>): Promise<void> {
    const reader  = body.getReader();
    let   partial = new Uint8Array(0);

    // JPEG SOI / EOI markers
    const SOI = [0xFF, 0xD8];
    const EOI = [0xFF, 0xD9];

    const findSequence = (buf: Uint8Array, seq: number[]): number => {
      for (let i = 0; i <= buf.length - seq.length; i++) {
        if (seq.every((b, j) => buf[i + j] === b)) return i;
      }
      return -1;
    };

    try {
      while (!this.disposed) {
        const { done, value } = await reader.read();
        if (done) break;
        this.resetTimeout();

        // Append chunk to partial buffer
        const combined = new Uint8Array(partial.length + value.length);
        combined.set(partial);
        combined.set(value, partial.length);
        partial = combined;

        // Extract complete JPEG frames from the buffer
        let soiIdx: number;
        while ((soiIdx = findSequence(partial, SOI)) !== -1) {
          const eoiIdx = findSequence(partial.subarray(soiIdx + 2), EOI);
          if (eoiIdx === -1) break; // incomplete frame

          const jpegEnd  = soiIdx + 2 + eoiIdx + 2;
          const jpegData = partial.slice(soiIdx, jpegEnd);
          partial        = partial.slice(jpegEnd);

          if (this._playback === 'playing') {
            await this.decodeJPEGFrame(jpegData);
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private async decodeJPEGFrame(data: Uint8Array): Promise<void> {
    const blob = new Blob([data], { type: 'image/jpeg' });
    const url  = URL.createObjectURL(blob);

    return new Promise(resolve => {
      const img   = new Image();
      img.onload  = () => {
        const canvas = document.createElement('canvas');
        canvas.width  = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext('2d')?.drawImage(img, 0, 0);
        this.latestCanvas = canvas;
        this.latestJpeg   = data;
        URL.revokeObjectURL(url);

        const raw = this.getFrame();
        if (raw) for (const cb of this.frameCbs) cb(raw);
        resolve();
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(); };
      img.src     = url;
    });
  }

  private extractBoundary(contentType: string): string | null {
    const match = contentType.match(/boundary=([^\s;]+)/i);
    return match?.[1] ?? null;
  }

  private resetTimeout(): void {
    this.clearTimeout();
    this.timeoutHandle = setTimeout(() => {
      if (this._status === 'playing') {
        this._lastError = `No frame received for ${this.config.timeoutMs}ms`;
        logger.warn('MJPEGSource', this._lastError);
        this.stop();
        this.scheduleReconnect();
      }
    }, this.config.timeoutMs!);
  }

  private clearTimeout(): void {
    if (this.timeoutHandle !== null) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.disposed) return;
    if (this._reconnects >= (this.config.maxReconnects ?? 10)) {
      this._status = 'error';
      for (const cb of this.errorCbs) cb(new Error(this._lastError ?? 'Max reconnects reached'));
      return;
    }
    this._reconnects++;
    this._status = 'reconnecting';
    logger.info('MJPEGSource', `Reconnect attempt ${this._reconnects}…`);
    setTimeout(() => { if (!this.disposed) void this.openStream(); }, this.config.reconnectDelayMs!);
  }

  private buildMeta(w: number, h: number): FrameMetadata {
    return {
      frameId:             `mjpeg-${++_frameCounter}`,
      frameNumber:         ++this._frameNum,
      sourceTimestamp:     performance.now(),
      processingTimestamp: Date.now(),
      videoTimestamp:      null,
      sourceName:          this.label,
      resolution:          { width: w, height: h },
      sourceFps:           0,
    };
  }
}

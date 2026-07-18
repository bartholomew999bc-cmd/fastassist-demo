/**
 * FAST-Assist Studio — RTSP Stream Source
 *
 * RTSP cannot be decoded by browsers natively. This source routes the stream
 * through the backend proxy at /api/video/rtsp-proxy which re-encodes the
 * RTSP feed as MJPEG (multipart/x-mixed-replace) for browser consumption.
 *
 * Backend proxy requires ffmpeg on the server.
 * TODO (backend): implement ffmpeg RTSP → MJPEG transcoding in server/api.ts
 *
 * The frontend interface is identical to MJPEGSource — consumers cannot tell
 * whether they are receiving a direct MJPEG stream or a proxied RTSP feed.
 */

import type {
  IVideoSource, SourceKind, SourceStatus, PlaybackState,
  SourceMetadata, SourceCapabilities, RawFrame,
  FrameCallback, ErrorCallback, DisconnectCallback, FrameMetadata,
} from '../IVideoSource';
import { logger } from '@/utils/logger';

export interface RTSPConfig {
  /** rtsp:// URL to the source stream */
  url:              string;
  /** Backend proxy base URL. Default: '/api/video/rtsp-proxy' */
  proxyEndpoint?:   string;
  /** Abort & reconnect after this many ms without a frame. Default: 15 000 */
  timeoutMs?:       number;
  /** Max reconnect attempts. Default: 8 */
  maxReconnects?:   number;
  reconnectDelayMs?: number;
}

let _frameCounter = 0;

export class RTSPSource implements IVideoSource {
  readonly kind:  SourceKind = 'rtsp';
  readonly label: string;

  private config:       RTSPConfig;
  private _status:      SourceStatus  = 'idle';
  private _playback:    PlaybackState = 'idle';
  private _frameNum:    number        = 0;
  private _reconnects:  number        = 0;
  private _lastError:   string | null = null;

  private abortCtrl:     AbortController | null = null;
  private timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  private latestCanvas:  HTMLCanvasElement | null = null;
  private disposed      = false;

  private frameCbs:      FrameCallback[]      = [];
  private errorCbs:      ErrorCallback[]      = [];
  private disconnectCbs: DisconnectCallback[] = [];

  constructor(config: RTSPConfig) {
    this.config = {
      proxyEndpoint:    '/api/video/rtsp-proxy',
      timeoutMs:        15_000,
      maxReconnects:    8,
      reconnectDelayMs: 3000,
      ...config,
    };
    this.label = `RTSP: ${config.url}`;
  }

  async initialize(): Promise<void> {
    if (!this.config.url.startsWith('rtsp://') &&
        !this.config.url.startsWith('rtsps://')) {
      throw new Error(`RTSPSource: expected rtsp:// URL, got "${this.config.url}"`);
    }
    this._status = 'connecting';

    // Check if proxy is available
    const proxyUrl = this.buildProxyUrl();
    const health   = await fetch(proxyUrl, { method: 'HEAD', signal: AbortSignal.timeout(3000) })
      .then(r => r.ok || r.status === 200)
      .catch(() => false);

    if (!health) {
      logger.warn('RTSPSource', 'Backend proxy not reachable — RTSP requires the dev server to be running');
    }
  }

  async connect(): Promise<void> {
    await this.openProxyStream();
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
    this.latestCanvas  = null;
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

  getUrl(): string { return this.buildProxyUrl(); }

  getMetadata(): SourceMetadata {
    return {
      kind:              this.kind,
      label:             this.label,
      resolution:        this.latestCanvas
        ? { width: this.latestCanvas.width, height: this.latestCanvas.height }
        : null,
      durationSecs:      null,
      fps:               null,
      codec:             'RTSP→MJPEG proxy',
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

  private buildProxyUrl(): string {
    return `${this.config.proxyEndpoint}?url=${encodeURIComponent(this.config.url)}`;
  }

  private async openProxyStream(): Promise<void> {
    this.abortCtrl = new AbortController();
    this.resetTimeout();

    try {
      const resp = await fetch(this.buildProxyUrl(), {
        signal: this.abortCtrl.signal,
        cache:  'no-store',
      });
      if (!resp.ok) throw new Error(`Proxy returned HTTP ${resp.status}`);
      if (!resp.body) throw new Error('Proxy response has no body');

      this._status  = 'connected';
      this._playback = 'playing';
      logger.info('RTSPSource', `Proxy stream open for ${this.config.url}`);

      await this.readMJPEGStream(resp.body);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      this._lastError = (err as Error).message;
      this._status    = 'error';
      logger.warn('RTSPSource', 'Proxy stream error', err);
      this.scheduleReconnect();
    }
  }

  private async readMJPEGStream(body: ReadableStream<Uint8Array>): Promise<void> {
    const reader = body.getReader();
    let partial  = new Uint8Array(0);

    const SOI = [0xFF, 0xD8];
    const EOI = [0xFF, 0xD9];

    const find = (buf: Uint8Array, seq: number[]): number => {
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

        const combined = new Uint8Array(partial.length + value.length);
        combined.set(partial);
        combined.set(value, partial.length);
        partial = combined;

        let soiIdx: number;
        while ((soiIdx = find(partial, SOI)) !== -1) {
          const eoiIdx = find(partial.subarray(soiIdx + 2), EOI);
          if (eoiIdx === -1) break;
          const end  = soiIdx + 2 + eoiIdx + 2;
          const jpeg = partial.slice(soiIdx, end);
          partial    = partial.slice(end);
          if (this._playback === 'playing') await this.decodeJPEG(jpeg);
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private async decodeJPEG(data: Uint8Array): Promise<void> {
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
        URL.revokeObjectURL(url);
        const raw = this.getFrame();
        if (raw) for (const cb of this.frameCbs) cb(raw);
        resolve();
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(); };
      img.src     = url;
    });
  }

  private resetTimeout(): void {
    this.clearTimeout();
    this.timeoutHandle = setTimeout(() => {
      this._lastError = `RTSP proxy timeout — no frame for ${this.config.timeoutMs}ms`;
      logger.warn('RTSPSource', this._lastError);
      this.stop();
      this.scheduleReconnect();
    }, this.config.timeoutMs!);
  }

  private clearTimeout(): void {
    if (this.timeoutHandle !== null) { clearTimeout(this.timeoutHandle); this.timeoutHandle = null; }
  }

  private scheduleReconnect(): void {
    if (this.disposed) return;
    if (this._reconnects >= (this.config.maxReconnects ?? 8)) {
      this._status = 'error';
      for (const cb of this.errorCbs) cb(new Error(this._lastError ?? 'Max RTSP reconnects reached'));
      return;
    }
    this._reconnects++;
    this._status = 'reconnecting';
    setTimeout(() => { if (!this.disposed) void this.openProxyStream(); },
               (this.config.reconnectDelayMs ?? 3000) * this._reconnects);
  }

  private buildMeta(w: number, h: number): FrameMetadata {
    return {
      frameId: `rtsp-${++_frameCounter}`, frameNumber: ++this._frameNum,
      sourceTimestamp: performance.now(), processingTimestamp: Date.now(),
      videoTimestamp: null, sourceName: this.label,
      resolution: { width: w, height: h }, sourceFps: 0,
    };
  }
}

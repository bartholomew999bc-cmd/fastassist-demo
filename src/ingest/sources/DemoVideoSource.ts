/**
 * FAST-Assist Studio — Demo Video Source
 *
 * Plays an MP4 / MOV / WEBM demo file from a URL.
 * Supports play, pause, seek, loop, and playback speed.
 *
 * The actual <video> element is rendered by SourceRenderer (React).
 * This source exposes getUrl() for SourceRenderer to set the src attribute,
 * and controls playback by querying the live DOM element (#fast-assist-video).
 */

import type {
  IVideoSource, SourceKind, SourceStatus, PlaybackState,
  SourceMetadata, SourceCapabilities, RawFrame,
  FrameCallback, ErrorCallback, DisconnectCallback, FrameMetadata,
} from '../IVideoSource';
import { logger } from '@/utils/logger';

export interface DemoVideoConfig {
  /** HTTP URL or relative path to the video file */
  url:           string;
  loop?:         boolean;
  playbackRate?: number;
  autoPlay?:     boolean;
}

let _frameCounter = 0;

export class DemoVideoSource implements IVideoSource {
  readonly kind:  SourceKind = 'demo';
  readonly label: string;

  private config:      DemoVideoConfig;
  private _status:     SourceStatus  = 'idle';
  private _playback:   PlaybackState = 'idle';
  private _frameNum:   number        = 0;
  private _reconnects: number        = 0;
  private _lastError:  string | null = null;

  private desiredPlaying = false;

  private frameCbs:      FrameCallback[]      = [];
  private errorCbs:      ErrorCallback[]      = [];
  private disconnectCbs: DisconnectCallback[] = [];

  constructor(config: DemoVideoConfig) {
    this.config = { loop: true, playbackRate: 1, autoPlay: true, ...config };
    this.label  = `Demo: ${config.url.split('/').pop() ?? config.url}`;
  }

  async initialize(): Promise<void> {
    if (!this.config.url) throw new Error('DemoVideoSource: url is required');
    this._status = 'connecting';
  }

  async connect(): Promise<void> {
    // Connection resolves immediately; the DOM element is managed by SourceRenderer
    this._status  = 'connected';
    this._playback = 'idle';
    logger.info('DemoVideoSource', `Connected to ${this.config.url}`);
  }

  start(): void {
    this.desiredPlaying = true;
    this._status   = 'playing';
    this._playback = 'playing';
    this.tryApplyPlayback();
  }

  pause(): void {
    this.desiredPlaying = false;
    this._status   = 'paused';
    this._playback = 'paused';
    this.getDOMElement()?.pause();
  }

  resume(): void { this.start(); }

  stop(): void {
    this.desiredPlaying = false;
    this._status   = 'stopped';
    this._playback = 'stopped';
    const el = this.getDOMElement();
    if (el) { el.pause(); el.currentTime = 0; }
  }

  disconnect(): void {
    this.stop();
    this._status = 'disconnected';
    for (const cb of this.disconnectCbs) cb('manual disconnect');
  }

  dispose(): void {
    this.disconnect();
    this.frameCbs      = [];
    this.errorCbs      = [];
    this.disconnectCbs = [];
  }

  getFrame(): RawFrame | null {
    const el = this.getDOMElement();
    if (!el || this._playback === 'paused' || this._playback === 'stopped') return null;

    // Canvas elements (synthetic fallback) can always be read
    if (el instanceof HTMLCanvasElement) {
      return this.captureCanvas(el);
    }

    // Video elements need to be in a decodable state
    const vid = el as HTMLVideoElement;
    if (vid.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return null;
    if (vid.videoWidth === 0 || vid.videoHeight === 0) return null;

    const canvas = document.createElement('canvas');
    canvas.width  = vid.videoWidth;
    canvas.height = vid.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(vid, 0, 0);

    return {
      data: canvas,
      metadata: this.buildMeta(vid.videoWidth, vid.videoHeight,
                               Math.round(vid.currentTime * 1000)),
    };
  }

  getUrl(): string { return this.config.url; }

  seek(seconds: number): void {
    const el = this.getDOMElement();
    if (el instanceof HTMLVideoElement) el.currentTime = seconds;
  }

  setPlaybackSpeed(rate: number): void {
    this.config.playbackRate = rate;
    const el = this.getDOMElement();
    if (el instanceof HTMLVideoElement) el.playbackRate = rate;
  }

  setLoop(loop: boolean): void {
    this.config.loop = loop;
    const el = this.getDOMElement();
    if (el instanceof HTMLVideoElement) el.loop = loop;
  }

  getMetadata(): SourceMetadata {
    const el  = this.getDOMElement() as HTMLVideoElement | null;
    const vid = el instanceof HTMLVideoElement ? el : null;
    return {
      kind:              this.kind,
      label:             this.label,
      resolution:        vid?.videoWidth ? { width: vid.videoWidth, height: vid.videoHeight } : null,
      durationSecs:      vid?.duration ?? null,
      fps:               null,
      codec:             null,
      bitrateBps:        null,
      status:            this._status,
      playbackState:     this._playback,
      reconnectAttempts: this._reconnects,
      lastError:         this._lastError,
    };
  }

  getCapabilities(): SourceCapabilities {
    return {
      canPause:            true,
      canSeek:             true,
      canChangeSpeed:      true,
      canChangeResolution: false,
      hasAudio:            false,
      supportsLoop:        true,
      maxFps:              60,
    };
  }

  getStatus(): SourceStatus { return this._status; }
  getPlaybackState(): PlaybackState { return this._playback; }

  isLooping(): boolean  { return this.config.loop ?? true; }
  playbackRate(): number { return this.config.playbackRate ?? 1; }

  onFrame(cb: FrameCallback):           void { this.frameCbs.push(cb); }
  onError(cb: ErrorCallback):           void { this.errorCbs.push(cb); }
  onDisconnect(cb: DisconnectCallback): void { this.disconnectCbs.push(cb); }

  // ── Private ────────────────────────────────────────────────────────────────

  private getDOMElement(): HTMLVideoElement | HTMLCanvasElement | null {
    return document.getElementById('fast-assist-video') as
      HTMLVideoElement | HTMLCanvasElement | null;
  }

  /** Retry play() until the DOM element appears (React may not have rendered yet). */
  private tryApplyPlayback(): void {
    const el = this.getDOMElement();
    if (!el) {
      requestAnimationFrame(() => { if (this.desiredPlaying) this.tryApplyPlayback(); });
      return;
    }
    if (el instanceof HTMLVideoElement) {
      el.loop        = this.config.loop ?? true;
      el.playbackRate = this.config.playbackRate ?? 1;
      el.play().catch(err => {
        this._lastError = String(err);
        logger.warn('DemoVideoSource', 'play() rejected', err);
        this._status   = 'error';
        this._playback = 'idle';
      });
    }
  }

  private captureCanvas(canvas: HTMLCanvasElement): RawFrame {
    const offscreen = document.createElement('canvas');
    offscreen.width  = canvas.width;
    offscreen.height = canvas.height;
    offscreen.getContext('2d')?.drawImage(canvas, 0, 0);
    return {
      data: offscreen,
      metadata: this.buildMeta(canvas.width, canvas.height, null),
    };
  }

  private buildMeta(w: number, h: number, videoTs: number | null): FrameMetadata {
    return {
      frameId:             `demo-${++_frameCounter}`,
      frameNumber:         ++this._frameNum,
      sourceTimestamp:     performance.now(),
      processingTimestamp: Date.now(),
      videoTimestamp:      videoTs,
      sourceName:          this.label,
      resolution:          { width: w, height: h },
      sourceFps:           0,
    };
  }
}

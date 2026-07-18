/**
 * FAST-Assist Studio — Upload Video Source
 *
 * Accepts a File object (mp4 / mov / avi / webm) from the user.
 * Creates an object URL for SourceRenderer and exposes video metadata
 * (duration, resolution, estimated fps) once the element loads.
 */

import type {
  IVideoSource, SourceKind, SourceStatus, PlaybackState,
  SourceMetadata, SourceCapabilities, RawFrame,
  FrameCallback, ErrorCallback, DisconnectCallback, FrameMetadata,
} from '../IVideoSource';
import { logger } from '@/utils/logger';

export const ACCEPTED_VIDEO_TYPES = [
  'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm',
];
export const ACCEPTED_EXTENSIONS = /\.(mp4|mov|avi|webm)$/i;

let _frameCounter = 0;

export class UploadVideoSource implements IVideoSource {
  readonly kind:  SourceKind = 'upload';
  readonly label: string;

  private file:       File;
  private objectUrl:  string | null = null;
  private _status:    SourceStatus  = 'idle';
  private _playback:  PlaybackState = 'idle';
  private _frameNum:  number        = 0;
  private _lastError: string | null = null;

  private desiredPlaying = false;

  private frameCbs:      FrameCallback[]      = [];
  private errorCbs:      ErrorCallback[]      = [];
  private disconnectCbs: DisconnectCallback[] = [];

  constructor(file: File) {
    this.file  = file;
    this.label = `Upload: ${file.name}`;
  }

  static isAccepted(file: File): boolean {
    return (
      ACCEPTED_VIDEO_TYPES.includes(file.type) ||
      ACCEPTED_EXTENSIONS.test(file.name)
    );
  }

  static formatSize(bytes: number): string {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  async initialize(): Promise<void> {
    if (!UploadVideoSource.isAccepted(this.file)) {
      throw new Error(
        `Unsupported video format "${this.file.type || this.file.name}". ` +
        `Accepted: mp4, mov, avi, webm`
      );
    }
    this._status = 'connecting';
  }

  async connect(): Promise<void> {
    this.objectUrl = URL.createObjectURL(this.file);
    this._status   = 'connected';
    logger.info('UploadVideoSource', `Loaded "${this.file.name}" (${UploadVideoSource.formatSize(this.file.size)})`);
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
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.frameCbs      = [];
    this.errorCbs      = [];
    this.disconnectCbs = [];
  }

  getFrame(): RawFrame | null {
    const el = this.getDOMElement();
    if (!el || this._playback !== 'playing') return null;
    if (el.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return null;
    if (el.videoWidth === 0 || el.videoHeight === 0) return null;

    const canvas = document.createElement('canvas');
    canvas.width  = el.videoWidth;
    canvas.height = el.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(el, 0, 0);

    return {
      data: canvas,
      metadata: {
        frameId:             `upload-${++_frameCounter}`,
        frameNumber:         ++this._frameNum,
        sourceTimestamp:     performance.now(),
        processingTimestamp: Date.now(),
        videoTimestamp:      Math.round(el.currentTime * 1000),
        sourceName:          this.label,
        resolution:          { width: el.videoWidth, height: el.videoHeight },
        sourceFps:           0,
      } satisfies FrameMetadata,
    };
  }

  getUrl(): string | null { return this.objectUrl; }

  /** Duration and resolution become available after SourceRenderer loads the element. */
  getVideoDetails(): { duration: number; width: number; height: number } | null {
    const el = this.getDOMElement();
    if (!el) return null;
    return { duration: el.duration, width: el.videoWidth, height: el.videoHeight };
  }

  seek(seconds: number):          void { const el = this.getDOMElement(); if (el) el.currentTime = seconds; }
  setPlaybackSpeed(rate: number): void { const el = this.getDOMElement(); if (el) el.playbackRate = rate; }
  setLoop(loop: boolean):         void { const el = this.getDOMElement(); if (el) el.loop = loop; }

  getMetadata(): SourceMetadata {
    const el = this.getDOMElement();
    return {
      kind:              this.kind,
      label:             this.label,
      resolution:        el?.videoWidth ? { width: el.videoWidth, height: el.videoHeight } : null,
      durationSecs:      el?.duration ?? null,
      fps:               null,
      codec:             null,
      bitrateBps:        null,
      status:            this._status,
      playbackState:     this._playback,
      reconnectAttempts: 0,
      lastError:         this._lastError,
    };
  }

  getCapabilities(): SourceCapabilities {
    return {
      canPause: true, canSeek: true, canChangeSpeed: true,
      canChangeResolution: false, hasAudio: false,
      supportsLoop: true, maxFps: 60,
    };
  }

  getStatus(): SourceStatus { return this._status; }

  onFrame(cb: FrameCallback):           void { this.frameCbs.push(cb); }
  onError(cb: ErrorCallback):           void { this.errorCbs.push(cb); }
  onDisconnect(cb: DisconnectCallback): void { this.disconnectCbs.push(cb); }

  private getDOMElement(): HTMLVideoElement | null {
    const el = document.getElementById('fast-assist-video');
    return el instanceof HTMLVideoElement ? el : null;
  }

  private tryApplyPlayback(): void {
    const el = this.getDOMElement();
    if (!el || !this.objectUrl) {
      requestAnimationFrame(() => { if (this.desiredPlaying) this.tryApplyPlayback(); });
      return;
    }
    el.loop = true;
    el.play().catch(err => {
      this._lastError = String(err);
      this._status    = 'error';
      this._playback  = 'idle';
      for (const cb of this.errorCbs) cb(err instanceof Error ? err : new Error(String(err)));
    });
  }
}

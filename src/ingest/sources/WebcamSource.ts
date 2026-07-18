/**
 * FAST-Assist Studio — Webcam Source
 *
 * Uses the MediaDevices API. Works identically for physical webcams and
 * OBS Virtual Camera — there is no OBS-specific code. OBS Virtual Camera
 * appears as a normal video input device when active.
 *
 * Supports:
 *   - Camera enumeration & selection
 *   - Resolution & FPS negotiation
 *   - Permission handling with clear error messages
 *   - Automatic reconnect on track-ended events
 */

import type {
  IVideoSource, SourceKind, SourceStatus, PlaybackState,
  SourceMetadata, SourceCapabilities, RawFrame,
  FrameCallback, ErrorCallback, DisconnectCallback, FrameMetadata,
} from '../IVideoSource';
import { logger } from '@/utils/logger';

export interface WebcamConfig {
  /** Specific device ID from enumerateCameras(). Undefined = default camera. */
  deviceId?:   string;
  width?:      number;
  height?:     number;
  frameRate?:  number;
  /** Automatically reconnect on disconnect. Default: true */
  autoReconnect?: boolean;
  /** Max reconnect attempts. Default: 5 */
  maxReconnects?: number;
}

export interface CameraDevice {
  deviceId: string;
  label:    string;
  /** True when the label contains OBS-like keywords */
  isOBS:    boolean;
}

let _frameCounter = 0;

export class WebcamSource implements IVideoSource {
  readonly kind:  SourceKind = 'webcam';
  get label(): string { return this._trackLabel ?? 'Webcam'; }

  private config:       WebcamConfig;
  private stream:       MediaStream | null = null;
  private _status:      SourceStatus  = 'idle';
  private _playback:    PlaybackState = 'idle';
  private _frameNum:    number        = 0;
  private _reconnects:  number        = 0;
  private _lastError:   string | null = null;
  private _trackLabel:  string | null = null;
  private disposed     = false;

  private frameCbs:      FrameCallback[]      = [];
  private errorCbs:      ErrorCallback[]      = [];
  private disconnectCbs: DisconnectCallback[] = [];

  constructor(config: WebcamConfig = {}) {
    this.config = {
      width: 1280, height: 720, frameRate: 30,
      autoReconnect: true, maxReconnects: 5,
      ...config,
    };
  }

  async initialize(): Promise<void> {
    // Check if camera permission is already denied
    try {
      const result = await navigator.permissions.query({ name: 'camera' as PermissionName });
      if (result.state === 'denied') {
        throw new Error(
          'Camera permission is denied. Enable it in your browser settings and reload.'
        );
      }
    } catch (e) {
      // Permissions API may not support 'camera' in all browsers — ignore
      if (e instanceof Error && e.message.includes('denied')) throw e;
    }
    this._status = 'connecting';
  }

  async connect(): Promise<void> {
    const constraints: MediaStreamConstraints = {
      video: {
        ...(this.config.deviceId ? { deviceId: { exact: this.config.deviceId } } : {}),
        width:     { ideal: this.config.width! },
        height:    { ideal: this.config.height! },
        frameRate: { ideal: this.config.frameRate! },
      },
      audio: false,
    };

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      this._lastError = this.describeGetUserMediaError(err);
      this._status    = 'error';
      throw new Error(this._lastError);
    }

    // Capture track label (includes OBS Virtual Camera name when active)
    const track = this.stream.getVideoTracks()[0];
    this._trackLabel = track?.label ?? 'Webcam';
    this._status     = 'connected';

    // Monitor for disconnect (camera unplugged, OBS closed, permission revoked)
    if (track) {
      track.addEventListener('ended', () => this.handleTrackEnded());
    }

    logger.info('WebcamSource', `Connected: "${this._trackLabel}"`);
  }

  start(): void {
    this._status   = 'playing';
    this._playback = 'playing';
    // SourceRenderer auto-plays the <video> element via autoplay attribute + srcObject
  }

  pause(): void {
    // Live streams cannot be truly paused — we just stop extracting frames
    this._status   = 'paused';
    this._playback = 'paused';
  }

  resume(): void {
    this._status   = 'playing';
    this._playback = 'playing';
  }

  stop(): void {
    this.stream?.getTracks().forEach(t => t.stop());
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
    this.disconnect();
    this.stream           = null;
    this.frameCbs         = [];
    this.errorCbs         = [];
    this.disconnectCbs    = [];
  }

  getFrame(): RawFrame | null {
    if (this._playback !== 'playing') return null;
    const el = this.getDOMElement();
    if (!el) return null;
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
        frameId:             `webcam-${++_frameCounter}`,
        frameNumber:         ++this._frameNum,
        sourceTimestamp:     performance.now(),
        processingTimestamp: Date.now(),
        videoTimestamp:      null, // live stream — no file position
        sourceName:          this.label,
        resolution:          { width: el.videoWidth, height: el.videoHeight },
        sourceFps:           this.config.frameRate ?? 30,
      } satisfies FrameMetadata,
    };
  }

  getMediaStream(): MediaStream | null { return this.stream; }
  getUrl(): null                       { return null; }

  // ── Static utilities ───────────────────────────────────────────────────────

  /** Enumerate all available cameras. Requests permission to unlock device labels. */
  static async enumerateCameras(): Promise<CameraDevice[]> {
    // Minimal permission trigger — immediately stop the stream
    try {
      const probe = await navigator.mediaDevices.getUserMedia({ video: true });
      probe.getTracks().forEach(t => t.stop());
    } catch { /* ignore — proceed with unlabeled devices */ }

    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter(d => d.kind === 'videoinput')
      .map(d => ({
        deviceId: d.deviceId,
        label:    d.label || `Camera ${d.deviceId.slice(0, 6)}`,
        isOBS:    /obs|virtual|ndisources|camera for obs/i.test(d.label),
      }));
  }

  /** Heuristically detect OBS Virtual Camera. Returns null if not found. */
  static async detectOBS(): Promise<CameraDevice | null> {
    const cameras = await WebcamSource.enumerateCameras().catch(() => []);
    return cameras.find(d => d.isOBS) ?? null;
  }

  // ── Inspection ─────────────────────────────────────────────────────────────

  getMetadata(): SourceMetadata {
    const el       = this.getDOMElement();
    const settings = this.stream?.getVideoTracks()[0]?.getSettings();
    return {
      kind:              this.kind,
      label:             this.label,
      resolution:        el?.videoWidth ? { width: el.videoWidth, height: el.videoHeight } : null,
      durationSecs:      null,
      fps:               settings?.frameRate ?? null,
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
      canPause:            false, // live stream
      canSeek:             false,
      canChangeSpeed:      false,
      canChangeResolution: true,
      hasAudio:            false,
      supportsLoop:        false,
      maxFps:              this.config.frameRate ?? 30,
    };
  }

  getStatus(): SourceStatus { return this._status; }

  onFrame(cb: FrameCallback):           void { this.frameCbs.push(cb); }
  onError(cb: ErrorCallback):           void { this.errorCbs.push(cb); }
  onDisconnect(cb: DisconnectCallback): void { this.disconnectCbs.push(cb); }

  // ── Private ────────────────────────────────────────────────────────────────

  private getDOMElement(): HTMLVideoElement | null {
    const el = document.getElementById('fast-assist-video');
    return el instanceof HTMLVideoElement ? el : null;
  }

  private handleTrackEnded(): void {
    if (this.disposed) return;
    this._lastError = 'Camera track ended — device unplugged, OBS closed, or permission revoked';
    this._status    = 'disconnected';
    logger.warn('WebcamSource', this._lastError);

    for (const cb of this.disconnectCbs) cb(this._lastError);

    // Auto-reconnect
    if (this.config.autoReconnect && this._reconnects < (this.config.maxReconnects ?? 5)) {
      this._reconnects++;
      this._status = 'reconnecting';
      setTimeout(() => this.attemptReconnect(), 2000);
    }
  }

  private async attemptReconnect(): Promise<void> {
    if (this.disposed) return;
    try {
      await this.connect();
      this.start();
      logger.info('WebcamSource', `Reconnected after ${this._reconnects} attempt(s)`);
    } catch (err) {
      logger.error('WebcamSource', 'Reconnect failed', err);
      if (this._reconnects < (this.config.maxReconnects ?? 5)) {
        this._reconnects++;
        setTimeout(() => this.attemptReconnect(), 3000 * this._reconnects);
      } else {
        this._status = 'error';
        for (const cb of this.errorCbs) {
          cb(err instanceof Error ? err : new Error(String(err)));
        }
      }
    }
  }

  private describeGetUserMediaError(err: unknown): string {
    if (!(err instanceof Error)) return String(err);
    if (err.name === 'NotAllowedError')  return 'Camera permission denied';
    if (err.name === 'NotFoundError')    return 'No camera found with that device ID';
    if (err.name === 'NotReadableError') return 'Camera is in use by another application';
    if (err.name === 'OverconstrainedError') return 'Camera does not support requested resolution';
    return err.message;
  }
}

/**
 * FAST-Assist Studio — Synthetic Ultrasound Source
 *
 * An IVideoSource implementation that represents the synthetic canvas fallback.
 * No network connection or file is required — the canvas element is rendered
 * by SyntheticUltrasound and placed in the DOM at id="fast-assist-video".
 * FrameExtractor will find and capture from it as with any other source.
 */

import type {
  IVideoSource, SourceKind, SourceStatus, PlaybackState,
  SourceMetadata, SourceCapabilities, RawFrame,
  FrameCallback, ErrorCallback, DisconnectCallback,
} from '../IVideoSource';

export class SyntheticSource implements IVideoSource {
  readonly kind:  SourceKind = 'synthetic';
  readonly label = 'Synthetic Ultrasound';

  private _status:  SourceStatus  = 'idle';
  private _playback: PlaybackState = 'idle';

  private frameCbs:      FrameCallback[]      = [];
  private errorCbs:      ErrorCallback[]      = [];
  private disconnectCbs: DisconnectCallback[] = [];

  async initialize(): Promise<void> {
    this._status = 'connecting';
  }

  async connect(): Promise<void> {
    // No connection required — canvas is rendered by the React component tree
    this._status = 'connected';
  }

  start(): void {
    this._status   = 'playing';
    this._playback = 'playing';
  }

  pause(): void {
    this._status   = 'paused';
    this._playback = 'paused';
  }

  resume(): void {
    this.start();
  }

  stop(): void {
    this._status   = 'stopped';
    this._playback = 'stopped';
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

  /**
   * FrameExtractor reads the DOM element directly (id="fast-assist-video"),
   * so getFrame() is not called. Returns null as a safe no-op.
   */
  getFrame(): RawFrame | null { return null; }

  getUrl(): null        { return null; }
  getMediaStream(): null { return null; }

  getMetadata(): SourceMetadata {
    return {
      kind:              this.kind,
      label:             this.label,
      resolution:        { width: 640, height: 480 },
      durationSecs:      null,
      fps:               60,
      codec:             'Canvas 2D',
      bitrateBps:        null,
      status:            this._status,
      playbackState:     this._playback,
      reconnectAttempts: 0,
      lastError:         null,
    };
  }

  getCapabilities(): SourceCapabilities {
    return {
      canPause:            false,
      canSeek:             false,
      canChangeSpeed:      false,
      canChangeResolution: false,
      hasAudio:            false,
      supportsLoop:        true,
      maxFps:              60,
    };
  }

  getStatus(): SourceStatus { return this._status; }

  onFrame(cb: FrameCallback):           void { this.frameCbs.push(cb); }
  onError(cb: ErrorCallback):           void { this.errorCbs.push(cb); }
  onDisconnect(cb: DisconnectCallback): void { this.disconnectCbs.push(cb); }
}

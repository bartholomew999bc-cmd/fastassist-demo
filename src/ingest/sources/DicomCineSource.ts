/**
 * FAST-Assist Studio — DICOM Cine Loop Source (PLACEHOLDER)
 *
 * Full implementation requires a DICOM parser such as:
 *   - cornerstone.js (https://cornerstonejs.org)
 *   - dcmjs (https://github.com/dcmjs-org/dcmjs)
 *   - dicom-parser (https://github.com/cornerstonejs/dicomParser)
 *
 * TODO: Implement DICOM file parsing, frame extraction from multi-frame DICOM,
 *       pixel data decompression (JPEG-LS, JPEG 2000, RLE), and windowing.
 *
 * This stub exposes the correct interface so the pipeline can type-check
 * and the UI can show the DICOM option. Attempting to connect throws a clear
 * "not implemented" error.
 */

import type {
  IVideoSource, SourceKind, SourceStatus, PlaybackState,
  SourceMetadata, SourceCapabilities, RawFrame,
  FrameCallback, ErrorCallback, DisconnectCallback,
} from '../IVideoSource';

export class DicomCineSource implements IVideoSource {
  readonly kind:  SourceKind = 'dicom';
  readonly label = 'DICOM Cine Loop';

  private _status:  SourceStatus  = 'idle';
  private _playback: PlaybackState = 'idle';

  private frameCbs:      FrameCallback[]      = [];
  private errorCbs:      ErrorCallback[]      = [];
  private disconnectCbs: DisconnectCallback[] = [];

  async initialize(): Promise<void> {
    throw new Error(
      'DICOM Cine Loop support is not yet implemented. ' +
      'Requires cornerstone.js or dcmjs for DICOM file parsing. ' +
      'See src/ingest/sources/DicomCineSource.ts for integration instructions.'
    );
  }

  async connect(): Promise<void> { this._status = 'connected'; }
  start(): void   { this._status = 'playing';  this._playback = 'playing'; }
  pause(): void   { this._status = 'paused';   this._playback = 'paused'; }
  resume(): void  { this.start(); }
  stop(): void    { this._status = 'stopped';  this._playback = 'stopped'; }
  disconnect(): void { this._status = 'disconnected'; }
  dispose(): void {
    this.frameCbs = []; this.errorCbs = []; this.disconnectCbs = [];
  }

  getFrame(): RawFrame | null { return null; }

  getMetadata(): SourceMetadata {
    return {
      kind: this.kind, label: this.label,
      resolution: null, durationSecs: null, fps: null,
      codec: 'DICOM (not implemented)', bitrateBps: null,
      status: this._status, playbackState: this._playback,
      reconnectAttempts: 0,
      lastError: 'DICOM support requires cornerstone.js — see DicomCineSource.ts',
    };
  }

  getCapabilities(): SourceCapabilities {
    return {
      canPause: true, canSeek: true, canChangeSpeed: true,
      canChangeResolution: false, hasAudio: false,
      supportsLoop: true, maxFps: 30,
    };
  }

  getStatus(): SourceStatus { return this._status; }

  onFrame(cb: FrameCallback):           void { this.frameCbs.push(cb); }
  onError(cb: ErrorCallback):           void { this.errorCbs.push(cb); }
  onDisconnect(cb: DisconnectCallback): void { this.disconnectCbs.push(cb); }
}

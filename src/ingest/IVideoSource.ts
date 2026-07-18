/**
 * FAST-Assist Studio — Video Source Interface
 *
 * Every video input (demo file, upload, webcam, OBS Virtual Camera, MJPEG,
 * RTSP, DICOM cine loop) implements this interface. The inference engine and
 * UI never depend on concrete source implementations — only on this contract.
 *
 * Call order for lifecycle: initialize() → connect() → start()
 * Teardown order:           stop() → disconnect() → dispose()
 */

// ─── Source Kinds ─────────────────────────────────────────────────────────────

export type SourceKind =
  | 'demo'       // Built-in demo video (mp4 / mov / webm)
  | 'upload'     // User-uploaded video file
  | 'webcam'     // Physical webcam or OBS Virtual Camera (via MediaDevices)
  | 'mjpeg'      // HTTP Motion JPEG stream
  | 'rtsp'       // RTSP stream (requires backend proxy)
  | 'dicom'      // DICOM cine loop (future)
  | 'synthetic'; // Synthetic ultrasound canvas (internal fallback)

export type SourceStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'playing'
  | 'paused'
  | 'stopped'
  | 'reconnecting'
  | 'error'
  | 'disconnected';

export type PlaybackState =
  | 'idle'
  | 'playing'
  | 'paused'
  | 'stopped'
  | 'ended';

// ─── Capabilities & Metadata ──────────────────────────────────────────────────

export interface SourceCapabilities {
  /** Source can be paused without full disconnection */
  canPause:            boolean;
  /** Source supports time-position seeking */
  canSeek:             boolean;
  /** Source supports playback speed control */
  canChangeSpeed:      boolean;
  /** Source allows resolution negotiation */
  canChangeResolution: boolean;
  /** Source carries an audio track */
  hasAudio:            boolean;
  /** Source can loop after reaching end */
  supportsLoop:        boolean;
  /** Maximum achievable input frame rate */
  maxFps:              number;
}

export interface SourceMetadata {
  kind:              SourceKind;
  label:             string;
  resolution:        { width: number; height: number } | null;
  /** null for live / infinite streaming sources */
  durationSecs:      number | null;
  fps:               number | null;
  codec:             string | null;
  bitrateBps:        number | null;
  status:            SourceStatus;
  playbackState:     PlaybackState;
  reconnectAttempts: number;
  lastError:         string | null;
}

// ─── Frame Types ──────────────────────────────────────────────────────────────

export interface FrameMetadata {
  /** Unique identifier for this frame */
  frameId:             string;
  /** Monotonic counter within this source session */
  frameNumber:         number;
  /** DOMHighResTimeStamp of capture (from rVFC or rAF) */
  sourceTimestamp:     number;
  /** Wall-clock time when preprocessing completed (Date.now()) */
  processingTimestamp: number;
  /** video.currentTime × 1000 ms; null for live sources */
  videoTimestamp:      number | null;
  /** Human-readable source name */
  sourceName:          string;
  /** Native resolution of the captured frame */
  resolution:          { width: number; height: number };
  /** Measured source frame rate (updated by FrameExtractor) */
  sourceFps:           number;
}

export interface RawFrame {
  /** Pixel data — ImageBitmap where supported, otherwise HTMLCanvasElement */
  data:     ImageBitmap | HTMLCanvasElement;
  metadata: FrameMetadata;
}

export interface ProcessedFrame {
  /** JPEG data URL ready for AI backend transport */
  dataUrl:  string;
  metadata: FrameMetadata;
  /** Estimated payload byte size */
  byteSize: number;
}

// ─── Callbacks ────────────────────────────────────────────────────────────────

export type FrameCallback      = (frame: RawFrame) => void;
export type ErrorCallback      = (error: Error) => void;
export type DisconnectCallback = (reason: string) => void;

// ─── Core Interface ───────────────────────────────────────────────────────────

/**
 * Every video source must implement this interface.
 * Implementations MUST be framework-agnostic — no React imports.
 */
export interface IVideoSource {
  readonly kind:  SourceKind;
  readonly label: string;

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  /** Validate config, request permissions. Must be called before connect(). */
  initialize(): Promise<void>;
  /** Open the connection or load the resource. */
  connect(): Promise<void>;
  /** Begin emitting frames. */
  start(): void;
  /** Pause frame emission (for seekable sources; no-op for live). */
  pause(): void;
  /** Resume after pause. */
  resume(): void;
  /** Stop emission and release playback-level resources. */
  stop(): void;
  /** Close connection without full disposal (allows reconnect). */
  disconnect(): void;
  /** Fully release all resources. Source cannot be restarted after dispose(). */
  dispose(): void;

  // ── Frame access ──────────────────────────────────────────────────────────
  /**
   * Synchronously capture the current frame as raw pixel data.
   * Returns null if the source is not ready, paused, or has no live frame.
   * The FrameExtractor calls this on a rVFC / rAF schedule.
   */
  getFrame(): RawFrame | null;

  // ── Media accessors (used by SourceRenderer to build the DOM) ────────────
  /** MediaStream for webcam / OBS sources; null for file-based sources. */
  getMediaStream?(): MediaStream | null;
  /** Playback URL for demo / upload / MJPEG sources; null otherwise. */
  getUrl?(): string | null;

  // ── Inspection ────────────────────────────────────────────────────────────
  getMetadata():     SourceMetadata;
  getCapabilities(): SourceCapabilities;
  getStatus():       SourceStatus;

  // ── Optional playback controls ────────────────────────────────────────────
  seek?(seconds: number):          void;
  setPlaybackSpeed?(rate: number): void;
  setLoop?(loop: boolean):         void;

  // ── Event callbacks ───────────────────────────────────────────────────────
  onFrame(cb: FrameCallback):           void;
  onError(cb: ErrorCallback):           void;
  onDisconnect(cb: DisconnectCallback): void;
}

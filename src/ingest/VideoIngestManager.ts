/**
 * FAST-Assist Studio — Video Ingest Manager
 *
 * Central orchestrator of the video ingest pipeline. Manages:
 *   - Source lifecycle (connect / disconnect / switch)
 *   - Frame extraction loop (via FrameExtractor)
 *   - Frame buffering (via FrameQueue)
 *   - Image preprocessing (via Preprocessor)
 *   - Diagnostics and statistics
 *   - Automatic reconnect on source failure
 *   - Hot source switching without application restart
 *
 * Framework-agnostic — no React imports. React integration is handled
 * by IngestContext and the useIngest hook.
 */

import { FrameQueue }     from './FrameQueue';
import { FrameExtractor } from './FrameExtractor';
import { Preprocessor }   from './Preprocessor';
import { ingestBus }      from './IngestEvents';
import type { IngestEventBus } from './IngestEvents';
import type { IVideoSource, ProcessedFrame, SourceKind, SourceStatus, PlaybackState } from './IVideoSource';
import { logger } from '@/utils/logger';

// ── Diagnostics ───────────────────────────────────────────────────────────────

export interface IngestDiagnostics {
  // Source info
  sourceKind:         SourceKind | null;
  sourceLabel:        string;
  sourceStatus:       SourceStatus;
  playbackState:      PlaybackState;
  resolution:         { width: number; height: number } | null;

  // Frame rates
  inputFps:           number;   // frames produced by source per second
  outputFps:          number;   // frames extracted & preprocessed per second
  inferenceFps:       number;   // frames acquired by inference per second

  // Frame accounting
  droppedFrames:      number;   // source-level drops (element not ready)
  skippedFrames:      number;   // extracted but not acquired by inference
  queueDepth:         number;

  // Latency (ms)
  decodeLatencyMs:    number;
  extractionLatencyMs: number;
  avgLatencyMs:       number;
  peakLatencyMs:      number;

  // Frame info
  currentFrame:       number;
  currentTimestampMs: number;

  // Memory
  estimatedMemoryBytes: number;

  // Error recovery
  reconnectAttempts:  number;
  lastError:          string | null;
}

// ── Manager options ────────────────────────────────────────────────────────────

export interface ManagerOptions {
  queueCapacity?: number;
  queueMaxAgeMs?: number;
  preprocessWidth?:  number;
  preprocessHeight?: number;
  preprocessQuality?: number;
}

// ── Manager class ─────────────────────────────────────────────────────────────

export class VideoIngestManager {
  readonly bus: IngestEventBus = ingestBus;

  private activeSource:   IVideoSource | null = null;
  private queue:          FrameQueue;
  private extractor:      FrameExtractor;
  private preprocessor:   Preprocessor;

  /** Most recent processed frame — consumed by acquireLatestFrame() */
  private latestFrame:    ProcessedFrame | null = null;
  /** Monotonic frame count from extractor callbacks */
  private extractedCount: number = 0;
  /** Count of frames acquired by inference this second */
  private inferenceCount: number = 0;
  private inferenceTs:    number = Date.now();
  private inferenceFps:   number = 0;

  /** Skipped = extracted - acquired */
  private skippedFrames:  number = 0;

  private disposed = false;

  constructor(options: ManagerOptions = {}) {
    this.queue = new FrameQueue({
      capacity: options.queueCapacity ?? 8,
      maxAgeMs: options.queueMaxAgeMs ?? 3000,
    });

    this.preprocessor = new Preprocessor({
      targetWidth:  options.preprocessWidth  ?? 640,
      targetHeight: options.preprocessHeight ?? 480,
      quality:      options.preprocessQuality ?? 0.82,
    });

    this.extractor = new FrameExtractor(
      this.preprocessor,
      (frame) => this.onFrameExtracted(frame),
    );
  }

  // ── Source management ────────────────────────────────────────────────────────

  /**
   * Hot-switch to a new source.
   * Stops and disposes the current source, initializes and connects the new one,
   * then starts the frame extractor. Emits SourceConnected on success.
   */
  async switchSource(source: IVideoSource): Promise<void> {
    if (this.disposed) throw new Error('VideoIngestManager has been disposed');

    logger.info('VideoIngestManager', `Switching to ${source.kind} — "${source.label}"`);

    // Tear down current source
    if (this.activeSource) {
      try {
        this.extractor.stop();
        this.activeSource.stop();
        this.activeSource.dispose();
        this.bus.emit('SourceDisconnected', {
          kind:   this.activeSource.kind,
          reason: 'Source switched',
        });
      } catch (err) {
        logger.warn('VideoIngestManager', 'Error disposing previous source', err);
      }
      this.activeSource = null;
      this.latestFrame  = null;
      this.queue.clear();
    }

    // Connect new source
    try {
      await source.initialize();
      await source.connect();

      source.onError(err => this.handleSourceError(source, err));
      source.onDisconnect(reason => this.handleSourceDisconnect(source, reason));

      this.activeSource = source;
      source.start();

      this.bus.emit('SourceConnected',  { kind: source.kind, label: source.label });
      this.bus.emit('PlaybackStarted',  { kind: source.kind });
      this.bus.emit('StatusChanged',    {
        kind: source.kind,
        status: source.getStatus(),
        playbackState: 'playing',
      });

      // Give React one frame to render the DOM element before extracting
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

      this.extractor.start();
      logger.info('VideoIngestManager', `Source "${source.label}" active`);

    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('VideoIngestManager', `Failed to connect source "${source.label}"`, err);
      this.bus.emit('ErrorOccurred', { kind: source.kind, error, recoverable: false });
      throw error;
    }
  }

  // ── Frame consumption ────────────────────────────────────────────────────────

  /**
   * Retrieve and consume the latest processed frame.
   * Returns null when no new frame has been extracted since the last call.
   * Called by the inference hook on each inference tick.
   */
  acquireLatestFrame(): ProcessedFrame | null {
    const frame = this.latestFrame;
    if (!frame) return null;
    this.latestFrame = null;

    // Update inference FPS counter
    this.inferenceCount++;
    const now = Date.now();
    if (now - this.inferenceTs >= 1000) {
      this.inferenceFps  = Math.round((this.inferenceCount * 1000) / (now - this.inferenceTs));
      this.inferenceCount = 0;
      this.inferenceTs   = now;
    }

    return frame;
  }

  // ── Playback controls ────────────────────────────────────────────────────────

  play(): void {
    this.activeSource?.resume();
    if (this.activeSource) this.bus.emit('PlaybackStarted', { kind: this.activeSource.kind });
  }

  pause(): void {
    this.activeSource?.pause();
    if (this.activeSource) this.bus.emit('PlaybackPaused', { kind: this.activeSource.kind });
  }

  stop(): void {
    this.extractor.stop();
    this.activeSource?.stop();
    if (this.activeSource) this.bus.emit('PlaybackStopped', { kind: this.activeSource.kind });
  }

  seek(seconds: number): void { this.activeSource?.seek?.(seconds); }

  setPlaybackSpeed(rate: number): void { this.activeSource?.setPlaybackSpeed?.(rate); }

  // ── Diagnostics ──────────────────────────────────────────────────────────────

  getDiagnostics(): IngestDiagnostics {
    const src    = this.activeSource;
    const meta   = src?.getMetadata();
    const exDiag = this.extractor.diagnostics();
    const qDiag  = this.queue.diagnostics();

    return {
      sourceKind:          src?.kind ?? null,
      sourceLabel:         meta?.label ?? '—',
      sourceStatus:        meta?.status ?? 'idle',
      playbackState:       meta?.playbackState ?? 'idle',
      resolution:          meta?.resolution ?? null,

      inputFps:            meta?.fps ?? 0,
      outputFps:           exDiag.outputFps,
      inferenceFps:        this.inferenceFps,

      droppedFrames:       exDiag.droppedTotal,
      skippedFrames:       this.skippedFrames,
      queueDepth:          qDiag.depth,

      decodeLatencyMs:     0, // TODO: measure decode in source
      extractionLatencyMs: exDiag.avgExtractionMs,
      avgLatencyMs:        exDiag.avgExtractionMs,
      peakLatencyMs:       exDiag.peakExtractionMs,

      currentFrame:        this.extractedCount,
      currentTimestampMs:  this.latestFrame?.metadata.sourceTimestamp ?? 0,

      estimatedMemoryBytes: qDiag.estimatedMemoryBytes,

      reconnectAttempts:   meta?.reconnectAttempts ?? 0,
      lastError:           meta?.lastError ?? null,
    };
  }

  getActiveSource(): IVideoSource | null { return this.activeSource; }

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.extractor.stop();
    this.activeSource?.stop();
    this.activeSource?.dispose();
    this.activeSource = null;
    this.preprocessor.dispose();
    this.bus.removeAllListeners();
    logger.info('VideoIngestManager', 'Disposed');
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  private onFrameExtracted(frame: ProcessedFrame): void {
    this.extractedCount++;

    // Track skipped frames (produced but not yet consumed)
    if (this.latestFrame !== null) this.skippedFrames++;

    this.latestFrame = frame;
    this.queue.enqueue(frame);

    this.bus.emit('FrameAvailable', { frame });
  }

  private handleSourceError(source: IVideoSource, error: Error): void {
    logger.error('VideoIngestManager', `Source error [${source.kind}]`, error);
    this.bus.emit('ErrorOccurred', {
      kind:        source.kind,
      error,
      recoverable: source.getStatus() === 'reconnecting',
    });
  }

  private handleSourceDisconnect(source: IVideoSource, reason: string): void {
    logger.warn('VideoIngestManager', `Source disconnected [${source.kind}]: ${reason}`);
    this.extractor.stop();
    this.bus.emit('SourceDisconnected', { kind: source.kind, reason });
  }
}

/**
 * FAST-Assist Studio — Inference Service
 *
 * Orchestrates frame capture → backend inference → state updates.
 * Automatically falls back to MockBackend if the primary backend is unreachable.
 * Supports both HTMLVideoElement and HTMLCanvasElement as frame sources.
 */

import type { InferenceBackend, InferenceResult } from '@/types';
import { MockBackend } from './MockBackend';
import { captureFrame } from '@/utils/frameCapture';
import { logger } from '@/utils/logger';

export type InferenceCallback    = (result: InferenceResult, latencyMs: number) => void;
export type ErrorCallback        = (error: unknown) => void;
export type ModeChangeCallback   = (isMock: boolean) => void;
export type MetricsCallback      = (fps: number, dropped: number) => void;

export class InferenceService {
  private backend: InferenceBackend;
  private fallback = new MockBackend();
  private isMock   = false;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private frameNumber    = 0;
  private droppedFrames  = 0;
  private lastFpsTime    = Date.now();
  private fpsFrameCount  = 0;
  private currentFps     = 0;

  constructor(
    backend: InferenceBackend,
    private readonly onResult:     InferenceCallback,
    private readonly onError:      ErrorCallback,
    private readonly onModeChange: ModeChangeCallback,
    private readonly onMetrics:    MetricsCallback,
  ) {
    this.backend = backend;
  }

  start(intervalMs: number): void {
    this.stop();
    logger.info('InferenceService', `Starting loop — ${intervalMs} ms`);
    console.log('[FAST] InferenceService.start() called, interval=', intervalMs);
    // Fire immediately, then at interval
    void this.tick();
    this.intervalId = setInterval(() => { void this.tick(); }, intervalMs);
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('InferenceService', 'Loop stopped');
    }
  }

  setBackend(backend: InferenceBackend): void {
    this.backend = backend;
    logger.info('InferenceService', `Backend → ${backend.label}`);
  }

  get isRunning(): boolean  { return this.intervalId !== null; }
  get isMockMode(): boolean { return this.isMock; }

  private async tick(): Promise<void> {
    // FPS tracking
    this.fpsFrameCount++;
    const now = Date.now();
    if (now - this.lastFpsTime >= 1000) {
      this.currentFps    = Math.round((this.fpsFrameCount * 1000) / (now - this.lastFpsTime));
      this.fpsFrameCount = 0;
      this.lastFpsTime   = now;
      this.onMetrics(this.currentFps, this.droppedFrames);
    }

    // Find the active frame source — video or canvas (synthetic)
    const source = document.querySelector<HTMLVideoElement | HTMLCanvasElement>(
      '#fast-assist-video'
    );
    console.log('[FAST] tick — source:', source?.tagName ?? 'NONE');
    if (!source) {
      this.droppedFrames++;
      return;
    }

    const frameDataUrl = captureFrame(source);
    console.log('[FAST] tick — frameDataUrl length:', frameDataUrl?.length ?? 0);
    if (!frameDataUrl) {
      this.droppedFrames++;
      return;
    }

    this.frameNumber++;
    const start = performance.now();

    try {
      const result  = await this.backend.infer(frameDataUrl);
      const latency = Math.round(performance.now() - start);
      if (this.isMock) { this.isMock = false; this.onModeChange(false); }
      console.log('[FAST] REST result:', result.scan_view);
      this.onResult(result, latency);
    } catch (restErr) {
      console.log('[FAST] REST failed, trying mock:', restErr);
      if (!this.isMock) { this.isMock = true; this.onModeChange(true); }
      try {
        const mockResult = await this.fallback.infer(frameDataUrl);
        const latency    = Math.round(performance.now() - start);
        console.log('[FAST] Mock result:', mockResult.scan_view);
        this.onResult(mockResult, latency);
      } catch (mockErr) {
        console.error('[FAST] Mock also failed:', mockErr);
        this.onError(mockErr);
      }
    }
  }
}

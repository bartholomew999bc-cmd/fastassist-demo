/**
 * FAST-Assist Studio — useInference Hook
 *
 * Drives the frame → AI → state update loop.
 *
 * Frames are acquired exclusively from VideoIngestManager.acquireLatestFrame()
 * so the inference path is fully decoupled from the DOM.
 *
 * Examination workflow integration:
 *   • Inference only runs during acquiring_* steps (idle / ready / complete = no-op).
 *   • When examPhase is 'awaiting_confirmation', the tick is a no-op so
 *     inference pauses while the operator reviews the frozen result.
 *   • The mock backend is pinned to the scenario matching the current exam
 *     window so results are always contextually appropriate.
 *   • A minimum acquisition frame count must be reached before the workflow
 *     will freeze, preventing an instant confirm on the very first frame.
 */

import { useState, useEffect, useRef } from 'react';
import type { InferenceResult } from '@/types';
import { useAppStore } from '@/state/store';
import { useIngestManager } from '@/ingest/IngestContext';
import { MockBackend } from '@/services/MockBackend';
import { RESTBackend } from '@/services/RESTBackend';
import { ema } from '@/utils/smoothing';
import { logger } from '@/utils/logger';
import { config } from '@/config';
import { isAcquiringStep, scenarioForStep } from '@/exam/sessionMeta';
import type { ExamSessionStep } from '@/types';

export interface InferenceState {
  result:      InferenceResult | null;
  latencyMs:   number;
  frameNumber: number;
  fps:         number;
  isMock:      boolean;
}

const INITIAL: InferenceState = {
  result:      null,
  latencyMs:   0,
  frameNumber: 0,
  fps:         0,
  isMock:      true,
};

/**
 * Minimum number of frames that must be processed in the current acquisition
 * window before the workflow is allowed to freeze for confirmation.
 * Prevents an immediate freeze on the first inference tick.
 */
const MIN_ACQUISITION_FRAMES = 4;

// Module-level mock backend — one instance shared across re-mounts
const mockBackend = new MockBackend();

export function useInference(): InferenceState {
  const [state, setState]   = useState<InferenceState>(INITIAL);
  const stateRef            = useRef<InferenceState>(INITIAL);

  // Ingest manager — the single source of frames
  const manager = useIngestManager();

  // Zustand actions (stable references, safe as effect deps)
  const setMockMode         = useAppStore(s => s.setMockMode);
  const setConnectionStatus = useAppStore(s => s.setConnectionStatus);
  const updateMetrics       = useAppStore(s => s.updateMetrics);
  const setResult           = useAppStore(s => s.setResult);
  const freezeOnResult      = useAppStore(s => s.freezeOnResult);

  useEffect(() => {
    const restBackend = new RESTBackend(
      useAppStore.getState().endpointUrl,
      4000,
    );

    let isMockLocal   = true;
    let fpsCount      = 0;
    let lastFpsTs     = Date.now();
    let droppedFrames = 0;
    let frameNumber   = 0;
    let smoothedMs    = 0;
    let running       = true;

    // Per-window acquisition frame counter — reset whenever the exam step
    // enters a new acquiring_* state.
    let lastExamStep: ExamSessionStep     = useAppStore.getState().examStep;
    let acquisitionFrameCount             = 0;

    // ── Health check ──────────────────────────────────────────────────────────
    setConnectionStatus('connecting');
    restBackend.healthCheck()
      .then(ok => {
        if (!running) return;
        isMockLocal = !ok;
        setConnectionStatus(ok ? 'connected' : 'mock');
        setMockMode(!ok);
      })
      .catch(() => {
        setConnectionStatus('mock');
        setMockMode(true);
      });

    // ── Inference tick ────────────────────────────────────────────────────────
    const tick = async () => {
      if (!running) return;

      const examStep  = useAppStore.getState().examStep;
      const examPhase = useAppStore.getState().examPhase;

      // Only run inference during active acquisition windows
      if (!isAcquiringStep(examStep)) return;

      // Pause inference while the operator is reviewing a frozen result
      if (examPhase === 'awaiting_confirmation') return;

      // Reset the per-window frame counter when entering a new window
      if (examStep !== lastExamStep) {
        lastExamStep          = examStep;
        acquisitionFrameCount = 0;
        logger.debug('useInference', `New acquisition window: ${examStep}`);
      }

      // Pin the mock backend to the appropriate scenario for this exam window
      mockBackend.pinToWindow(scenarioForStep(examStep));

      // FPS accounting
      fpsCount++;
      const nowMs = Date.now();
      if (nowMs - lastFpsTs >= 1000) {
        const fps = Math.round((fpsCount * 1000) / (nowMs - lastFpsTs));
        fpsCount  = 0;
        lastFpsTs = nowMs;
        updateMetrics({ fps, droppedFrames });
      }

      // Acquire the latest processed frame from the ingest pipeline
      const frame = manager.acquireLatestFrame();
      if (!frame) {
        droppedFrames++;
        return;
      }

      frameNumber++;
      acquisitionFrameCount++;
      const t0 = performance.now();

      const pushResult = (result: InferenceResult, mock: boolean) => {
        if (!running) return;
        const latencyMs = Math.round(performance.now() - t0);
        smoothedMs = smoothedMs === 0
          ? latencyMs
          : Math.round(ema(smoothedMs, latencyMs, config.confidenceSmoothFactor));

        // Primary update: React state — guaranteed to trigger re-renders
        const next: InferenceState = {
          result,
          latencyMs: smoothedMs,
          frameNumber,
          fps: stateRef.current.fps,
          isMock: mock,
        };
        stateRef.current = next;
        setState(next);

        // Mirror to Zustand for TopBar / StatusBar / InfoPanel
        setResult(result, smoothedMs);
        updateMetrics({ inferenceLatency: smoothedMs, frameNumber });

        if (mock !== isMockLocal) {
          isMockLocal = mock;
          setMockMode(mock);
          setConnectionStatus(mock ? 'mock' : 'connected');
        }

        logger.debug('useInference', `Frame ${frameNumber} via ${mock ? 'mock' : 'REST'} — ${latencyMs}ms`);

        // ── Examination workflow: freeze on threshold ──────────────────────
        // Only freeze after MIN_ACQUISITION_FRAMES to feel like genuine
        // acquisition work rather than an immediate confirmation prompt.
        const meetsThreshold =
          result.confidence      >= config.confirmConfidenceThreshold &&
          result.quality.overall >= config.confirmQualityThreshold   &&
          acquisitionFrameCount  >= MIN_ACQUISITION_FRAMES;

        if (meetsThreshold && useAppStore.getState().examPhase === 'acquiring') {
          freezeOnResult(result);
        }
      };

      // Try REST, fall back to mock
      try {
        const result = await restBackend.infer(frame.dataUrl);
        pushResult(result, false);
      } catch {
        try {
          const result = await mockBackend.infer(frame.dataUrl);
          pushResult(result, true);
        } catch (e) {
          logger.error('useInference', 'Both backends failed', e);
        }
      }
    };

    // Kick off immediately, then on interval
    void tick();
    const id = setInterval(() => { void tick(); }, config.inferenceInterval);

    return () => {
      running = false;
      clearInterval(id);
    };
  // manager is stable (singleton from context); Zustand setters are stable refs.
  }, [manager, setMockMode, setConnectionStatus, updateMetrics, setResult, freezeOnResult]); // eslint-disable-line react-hooks/exhaustive-deps

  return state;
}

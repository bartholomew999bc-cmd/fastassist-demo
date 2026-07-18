/**
 * FAST-Assist Studio — useInference Hook
 *
 * Returns `InferenceResult | null` from a polling loop that runs inside
 * a useEffect. All store writes happen through the React-owned setter so
 * React's batching and scheduling see every update correctly.
 *
 * Architecture note: the result is returned from this hook AND mirrored
 * into the Zustand store so other components (TopBar, StatusBar) can read
 * it without prop-drilling. The primary update path is the returned React
 * state, which is guaranteed to trigger re-renders.
 */

import { useState, useEffect, useRef } from 'react';
import type { InferenceResult } from '@/types';
import { useAppStore } from '@/state/store';
import { MockBackend } from '@/services/MockBackend';
import { RESTBackend } from '@/services/RESTBackend';
import { captureFrame } from '@/utils/frameCapture';
import { ema } from '@/utils/smoothing';
import { logger } from '@/utils/logger';
import { config } from '@/config';

const mockBackend = new MockBackend();

interface InferenceState {
  result: InferenceResult | null;
  latencyMs: number;
  frameNumber: number;
  fps: number;
  isMock: boolean;
}

const INITIAL: InferenceState = {
  result:      null,
  latencyMs:   0,
  frameNumber: 0,
  fps:         0,
  isMock:      true,
};

export function useInference(): InferenceState {
  const [state, setState] = useState<InferenceState>(INITIAL);
  const stateRef = useRef<InferenceState>(INITIAL); // sync read inside closure

  // Mirror key state to Zustand for TopBar / StatusBar reads
  const setMockMode       = useAppStore(s => s.setMockMode);
  const setConnectionStatus = useAppStore(s => s.setConnectionStatus);
  const updateMetrics     = useAppStore(s => s.updateMetrics);

  useEffect(() => {
    const restBackend = new RESTBackend(
      useAppStore.getState().endpointUrl,
      4000,
    );

    let isMockLocal    = true;  // local flag — no re-render cost
    let fpsCount       = 0;
    let lastFpsTs      = Date.now();
    let droppedFrames  = 0;
    let frameNumber    = 0;
    let smoothedMs     = 0;
    let running        = true;

    // ── Health check ──────────────────────────────────────────────────────────
    setConnectionStatus('connecting');
    restBackend.healthCheck().then(ok => {
      if (!running) return;
      if (ok) {
        isMockLocal = false;
        setConnectionStatus('connected');
        setMockMode(false);
      } else {
        setConnectionStatus('mock');
        setMockMode(true);
      }
    }).catch(() => {
      setConnectionStatus('mock');
      setMockMode(true);
    });

    // ── Inference tick ────────────────────────────────────────────────────────
    const tick = async () => {
      if (!running) return;

      // FPS
      fpsCount++;
      const nowMs = Date.now();
      if (nowMs - lastFpsTs >= 1000) {
        const fps = Math.round((fpsCount * 1000) / (nowMs - lastFpsTs));
        fpsCount  = 0;
        lastFpsTs = nowMs;
        updateMetrics({ fps, droppedFrames });
      }

      // Frame capture
      const source = document.querySelector<HTMLVideoElement | HTMLCanvasElement>(
        '#fast-assist-video'
      );
      if (!source) { droppedFrames++; return; }

      const frameData = captureFrame(source);
      if (!frameData) { droppedFrames++; return; }

      frameNumber++;
      const t0 = performance.now();

      const pushResult = (result: InferenceResult, mock: boolean) => {
        if (!running) return;
        const latencyMs = Math.round(performance.now() - t0);
        smoothedMs = smoothedMs === 0
          ? latencyMs
          : Math.round(ema(smoothedMs, latencyMs, config.confidenceSmoothFactor));

        // Primary update: React state — guaranteed to trigger re-render
        const next: InferenceState = {
          result,
          latencyMs: smoothedMs,
          frameNumber,
          fps: stateRef.current.fps,
          isMock: mock,
        };
        stateRef.current = next;
        setState(next);

        // Mirror to Zustand for sidebar components
        updateMetrics({ inferenceLatency: smoothedMs, frameNumber });
        if (mock !== isMockLocal) {
          isMockLocal = mock;
          setMockMode(mock);
          setConnectionStatus(mock ? 'mock' : 'connected');
        }
        logger.debug('useInference', `Frame ${frameNumber} via ${mock ? 'mock' : 'REST'} — ${latencyMs}ms`);
      };

      // Try REST, fall back to mock
      try {
        const result = await restBackend.infer(frameData);
        pushResult(result, false);
      } catch {
        try {
          const result = await mockBackend.infer(frameData);
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
  // Stable dependencies only — run once per mount
  }, [setMockMode, setConnectionStatus, updateMetrics]); // eslint-disable-line react-hooks/exhaustive-deps

  return state;
}

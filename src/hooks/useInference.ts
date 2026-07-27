/**
 * FAST-Assist Studio — useInference Hook
 *
 * Drives the frame → AI → state update loop through the active inference provider.
 *
 * Provider behaviour:
 *   'mock'   — Always serves from the Mock Provider. No health check.
 *   'hosted' — Health-checks QwenVLProvider on mount. If reachable,
 *              serves from Qwen2.5-VL via OpenRouter. On any failure,
 *              automatically falls back to Mock Provider and sets
 *              connectionStatus to 'fallback'. A recovery probe runs every
 *              RECOVERY_CHECK_INTERVAL ticks; when the endpoint becomes
 *              reachable again, hostedAvailable is set so the UI can prompt.
 *
 * Switching providers:
 *   The effect restarts when selectedProvider changes, cleanly re-initialising
 *   the appropriate backend without requiring an application restart.
 *   Because both providers produce identical InferenceResult shapes the
 *   examination workflow is never interrupted by a provider switch.
 *
 * Session log:
 *   Each successful hosted inference call appends a FullInferenceResult to
 *   the inferenceLog store, which the Inspector panel reads.
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
import type { InferenceResult, ProviderType } from '@/types';
import { useAppStore }       from '@/state/store';
import { useIngestManager }  from '@/ingest/IngestContext';
import { MockBackend }       from '@/services/MockBackend';
import { QwenVLProvider }    from '@/services/QwenVLProvider';
import { useInferenceLog }   from '@/state/inferenceLog';
import { ema }               from '@/utils/smoothing';
import { logger }            from '@/utils/logger';
import { config }            from '@/config';
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

/**
 * How many inference ticks to wait between Hosted AI recovery probes
 * while the system is running in fallback mode.
 * At a 1 200 ms interval this is roughly every 18 seconds.
 */
const RECOVERY_CHECK_INTERVAL = 15;

// Module-level backends — one instance each shared across re-mounts so state
// (scenario cycling, JSON cache) is preserved across provider switches.
const mockBackend = new MockBackend();
const qwenProvider = new QwenVLProvider();

export function useInference(): InferenceState {
  const [state, setState]   = useState<InferenceState>(INITIAL);
  const stateRef            = useRef<InferenceState>(INITIAL);

  // Ingest manager — the single source of frames
  const manager = useIngestManager();

  // Provider selection — changing this restarts the effect
  const selectedProvider = useAppStore(s => s.selectedProvider);

  // Zustand actions (stable references, safe as effect deps)
  const setMockMode         = useAppStore(s => s.setMockMode);
  const setConnectionStatus = useAppStore(s => s.setConnectionStatus);
  const updateMetrics       = useAppStore(s => s.updateMetrics);
  const setResult           = useAppStore(s => s.setResult);
  const freezeOnResult      = useAppStore(s => s.freezeOnResult);
  const setHostedAvailable  = useAppStore(s => s.setHostedAvailable);

  // Inference log — append full results from hosted provider
  const appendLog = useInferenceLog(s => s.append);

  useEffect(() => {
    // Which source is currently serving frames.
    // Starts pessimistic; updated by health check or first failed tick.
    let effectiveSource: ProviderType = 'mock';
    let inFallback                    = false;
    let running                       = true;

    let fpsCount      = 0;
    let lastFpsTs     = Date.now();
    let droppedFrames = 0;
    let frameNumber   = 0;
    let smoothedMs    = 0;
    let recoveryCount = 0;

    // Per-window acquisition frame counter — reset when the exam step changes.
    let lastExamStep: ExamSessionStep = useAppStore.getState().examStep;
    let acquisitionFrameCount         = 0;

    // ── Provider initialisation ───────────────────────────────────────────────

    if (selectedProvider === 'mock') {
      // Mock Provider explicitly selected — skip health check entirely.
      effectiveSource = 'mock';
      inFallback      = false;
      setConnectionStatus('mock');
      setMockMode(true);
      setHostedAvailable(false);
      logger.info('useInference', 'Mock Provider selected — offline demonstration mode');
    } else {
      // Hosted AI selected — probe before the first tick.
      setConnectionStatus('connecting');
      setHostedAvailable(false);

      qwenProvider.healthCheck()
        .then(ok => {
          if (!running) return;
          if (ok) {
            effectiveSource = 'hosted';
            inFallback      = false;
            setConnectionStatus('connected');
            setMockMode(false);
            logger.info('useInference', 'Qwen2.5-VL (OpenRouter) connected');
          } else {
            effectiveSource = 'mock';
            inFallback      = true;
            setConnectionStatus('fallback');
            setMockMode(true);
            logger.warn('useInference', 'Qwen2.5-VL unreachable — fallback to Mock Provider');
          }
        })
        .catch(() => {
          if (!running) return;
          effectiveSource = 'mock';
          inFallback      = true;
          setConnectionStatus('fallback');
          setMockMode(true);
          logger.warn('useInference', 'Hosted AI health check failed — fallback to Mock Provider');
        });
    }

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

      const pushResult = (result: InferenceResult, usedMock: boolean) => {
        if (!running) return;
        const latencyMs = Math.round(performance.now() - t0);
        smoothedMs = smoothedMs === 0
          ? latencyMs
          : Math.round(ema(smoothedMs, latencyMs, config.confidenceSmoothFactor));

        const next: InferenceState = {
          result,
          latencyMs: smoothedMs,
          frameNumber,
          fps: stateRef.current.fps,
          isMock: usedMock,
        };
        stateRef.current = next;
        setState(next);

        // Mirror to Zustand for TopBar / StatusBar / InfoPanel
        setResult(result, smoothedMs);
        updateMetrics({ inferenceLatency: smoothedMs, frameNumber });
        setMockMode(usedMock);

        logger.debug(
          'useInference',
          `Frame ${frameNumber} via ${usedMock ? 'mock' : 'hosted'} — ${latencyMs}ms`,
        );

        // ── Examination workflow: freeze on threshold ───────────────────────
        const meetsThreshold =
          result.confidence      >= config.confirmConfidenceThreshold &&
          result.quality.overall >= config.confirmQualityThreshold   &&
          acquisitionFrameCount  >= MIN_ACQUISITION_FRAMES;

        if (meetsThreshold && useAppStore.getState().examPhase === 'acquiring') {
          freezeOnResult(result);
        }
      };

      // ── Provider dispatch ─────────────────────────────────────────────────

      if (selectedProvider === 'mock') {
        // Mock Provider explicitly selected — always use mock, no fallback needed.
        try {
          const result = await mockBackend.infer(frame.dataUrl);
          pushResult(result, true);
        } catch (e) {
          logger.error('useInference', 'Mock Provider failed', e);
        }
        return;
      }

      // Hosted AI selected (Qwen2.5-VL)
      if (effectiveSource === 'hosted') {
        try {
          const full = await qwenProvider.inferFull(frame.dataUrl);
          // Log to Inspector session log
          appendLog(frameNumber, full);
          pushResult(full.metadata, false);
        } catch {
          // Hosted AI failed during normal operation — switch to fallback.
          effectiveSource = 'mock';
          inFallback      = true;
          recoveryCount   = 0;
          setConnectionStatus('fallback');
          setMockMode(true);
          setHostedAvailable(false);
          logger.warn('useInference', 'Qwen2.5-VL failed during acquisition — switching to fallback');

          // Serve this tick from mock so the exam continues uninterrupted.
          try {
            const result = await mockBackend.infer(frame.dataUrl);
            pushResult(result, true);
          } catch (e) {
            logger.error('useInference', 'Mock Provider also failed', e);
          }
        }
        return;
      }

      // In fallback mode — serve from mock and periodically probe hosted.
      if (inFallback) {
        recoveryCount++;
        if (recoveryCount >= RECOVERY_CHECK_INTERVAL) {
          recoveryCount = 0;
          // Fire-and-forget probe — does not interrupt the current tick.
          qwenProvider.healthCheck()
            .then(ok => {
              if (!running || selectedProvider !== 'hosted') return;
              if (ok) {
                setHostedAvailable(true);
                logger.info(
                  'useInference',
                  'Hosted AI is now reachable — operator can switch back manually',
                );
              } else {
                setHostedAvailable(false);
              }
            })
            .catch(() => { /* silent — will retry next interval */ });
        }

        try {
          const result = await mockBackend.infer(frame.dataUrl);
          pushResult(result, true);
        } catch (e) {
          logger.error('useInference', 'Mock Provider failed during fallback', e);
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
  // selectedProvider is a dep — the effect restarts when the operator switches.
  // manager is stable (singleton from context); Zustand setters are stable refs.
  }, [ // eslint-disable-line react-hooks/exhaustive-deps
    manager,
    selectedProvider,
    setMockMode,
    setConnectionStatus,
    updateMetrics,
    setResult,
    freezeOnResult,
    setHostedAvailable,
    appendLog,
  ]);

  return state;
}

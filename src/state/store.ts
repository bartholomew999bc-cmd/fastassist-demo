/**
 * FAST-Assist Studio — Zustand State Store
 *
 * Single source of truth for all application state.
 */

import { create } from 'zustand';
import type {
  AppState,
  InferenceResult,
  ConnectionStatus,
  AppTheme,
  BackendType,
  PerformanceMetrics,
  ExamSessionStep,
  ConfirmedView,
  ProviderType,
} from '@/types';
import { config } from '@/config';
import { ema } from '@/utils/smoothing';
import {
  FREEZE_STEP,
  CONFIRM_STEP,
  REACQUIRE_STEP,
} from '@/exam/sessionMeta';

interface AppActions {
  setResult(result: InferenceResult, latencyMs: number): void;
  setConnectionStatus(status: ConnectionStatus): void;
  setMockMode(isMock: boolean): void;
  setTheme(theme: AppTheme): void;
  setFullscreen(isFullscreen: boolean): void;
  setInferring(isInferring: boolean): void;
  setVideoPlaying(isPlaying: boolean): void;
  setVideoTime(time: number): void;
  updateMetrics(partial: Partial<PerformanceMetrics>): void;
  setBackendType(type: BackendType): void;
  setInferenceInterval(ms: number): void;
  resetMetrics(): void;

  // ── Provider selection ──────────────────────────────────────────────────────
  /**
   * Switch the active inference provider.
   * The inference hook watches this value and reinitialises when it changes,
   * so provider switching takes effect on the next inference cycle without
   * requiring an application restart.
   */
  setSelectedProvider(provider: ProviderType): void;
  /**
   * Set by the inference hook when a recovery probe finds the hosted AI
   * endpoint reachable while the system is currently running in fallback mode.
   * Signals to the UI that the operator can manually switch back to Hosted AI.
   */
  setHostedAvailable(available: boolean): void;

  // ── Developer inspector ─────────────────────────────────────────────────────
  /** Toggle or explicitly set the Inspector panel open/closed. */
  setInspectorOpen(open: boolean): void;

  // ── Examination session ─────────────────────────────────────────────────────
  /**
   * Begin the FAST examination sequence from the RUQ window.
   * Resets any prior confirmed views and starts from scratch.
   */
  startExam(): void;
  /**
   * Reset the examination back to idle (operator can start again).
   */
  resetExam(): void;
  /**
   * Freeze the workflow on a high-confidence result.
   * Transitions both examPhase and examStep to their awaiting variants.
   * The inference loop checks examPhase before each tick and will pause.
   */
  freezeOnResult(result: InferenceResult): void;
  /**
   * Operator confirmed the current view.
   * Records it in the session history and advances to the next window.
   */
  confirmView(): void;
  /**
   * Operator rejected the current view and wants to re-acquire.
   * Resumes acquisition of the same window without recording a confirmed view.
   */
  reacquire(): void;
}

const DEFAULT_METRICS: PerformanceMetrics = {
  fps:              0,
  inferenceLatency: 0,
  droppedFrames:    0,
  frameNumber:      0,
};

export const useAppStore = create<AppState & AppActions>()((set, get) => ({
  // ── Initial State ──────────────────────────────────────────────────────────

  // Provider
  selectedProvider:  config.defaultProvider,
  hostedAvailable:   false,

  // Connection (derived by the inference hook from provider state)
  isMockMode:        config.defaultProvider === 'mock',
  connectionStatus:  'connecting',

  theme:             config.theme,
  isFullscreen:      false,

  currentResult:     null,
  previousResult:    null,
  isInferring:       false,

  metrics:           { ...DEFAULT_METRICS },

  inferenceInterval: config.inferenceInterval,
  backendType:       config.defaultBackend,
  videoPath:         config.videoPath,
  endpointUrl:       config.endpointUrl,

  isVideoPlaying:    false,
  videoCurrentTime:  0,

  // Examination session — start idle; operator begins the exam explicitly
  examPhase:      'acquiring',
  examStep:       'idle',
  frozenResult:   null,
  confirmedViews: [],

  // Developer inspector — closed by default
  inspectorOpen: false,

  // ── Inference Actions ──────────────────────────────────────────────────────

  setResult(result, latencyMs) {
    const prev = get();
    const smoothedLatency = prev.metrics.inferenceLatency === 0
      ? latencyMs
      : ema(prev.metrics.inferenceLatency, latencyMs, config.confidenceSmoothFactor);

    set({
      previousResult: prev.currentResult,
      currentResult:  result,
      isInferring:    false,
      metrics: {
        ...prev.metrics,
        inferenceLatency: Math.round(smoothedLatency),
        frameNumber:      prev.metrics.frameNumber + 1,
      },
    });
  },

  setConnectionStatus(status) { set({ connectionStatus: status }); },

  setMockMode(isMock) {
    set({ isMockMode: isMock });
  },

  setTheme(theme) {
    set({ theme });
    document.documentElement.classList.toggle('dark', theme === 'dark');
  },

  setFullscreen(isFullscreen) { set({ isFullscreen }); },
  setInferring(isInferring)   { set({ isInferring }); },
  setVideoPlaying(isPlaying)  { set({ isVideoPlaying: isPlaying }); },
  setVideoTime(time)          { set({ videoCurrentTime: time }); },

  updateMetrics(partial) {
    set(state => ({ metrics: { ...state.metrics, ...partial } }));
  },

  setBackendType(type) { set({ backendType: type }); },
  setInferenceInterval(ms) { set({ inferenceInterval: ms }); },
  resetMetrics() { set({ metrics: { ...DEFAULT_METRICS } }); },

  // ── Provider Actions ───────────────────────────────────────────────────────

  setSelectedProvider(provider) {
    set({
      selectedProvider: provider,
      // Reset connection status; the hook will set it on reinit
      connectionStatus: 'connecting',
      hostedAvailable:  false,
    });
  },

  setHostedAvailable(available) { set({ hostedAvailable: available }); },

  setInspectorOpen(open) { set({ inspectorOpen: open }); },

  // ── Examination Session Actions ────────────────────────────────────────────

  startExam() {
    set({
      examStep:       'acquiring_ruq',
      examPhase:      'acquiring',
      frozenResult:   null,
      confirmedViews: [],
      currentResult:  null,
      previousResult: null,
      metrics:        { ...DEFAULT_METRICS },
    });
  },

  resetExam() {
    set({
      examStep:       'idle',
      examPhase:      'acquiring',
      frozenResult:   null,
      confirmedViews: [],
      currentResult:  null,
      previousResult: null,
    });
  },

  freezeOnResult(result) {
    const { examStep } = get();
    const nextStep: ExamSessionStep = FREEZE_STEP[examStep] ?? examStep;
    set({ examPhase: 'awaiting_confirmation', frozenResult: result, examStep: nextStep });
  },

  confirmView() {
    const { frozenResult, confirmedViews, examStep } = get();
    if (!frozenResult) return;

    const entry: ConfirmedView = {
      scanView:    frozenResult.scan_view,
      confidence:  frozenResult.confidence,
      quality:     frozenResult.quality.overall,
      confirmedAt: Date.now(),
      result:      frozenResult,
    };

    const nextStep: ExamSessionStep = CONFIRM_STEP[examStep] ?? examStep;

    set({
      examPhase:      'acquiring',
      frozenResult:   null,
      confirmedViews: [...confirmedViews, entry],
      examStep:       nextStep,
      // Clear live result so overlays don't linger between windows
      currentResult:  null,
    });
  },

  reacquire() {
    const { examStep } = get();
    const backStep: ExamSessionStep = REACQUIRE_STEP[examStep] ?? examStep;
    set({ examPhase: 'acquiring', frozenResult: null, examStep: backStep });
  },
}));

// ── Convenience selectors ─────────────────────────────────────────────────────
export const selectResult           = (s: AppState) => s.currentResult;
export const selectMetrics          = (s: AppState) => s.metrics;
export const selectStatus           = (s: AppState) => s.connectionStatus;
export const selectIsMock           = (s: AppState) => s.isMockMode;
export const selectTheme            = (s: AppState) => s.theme;
export const selectIsFullscreen     = (s: AppState) => s.isFullscreen;
export const selectExamPhase        = (s: AppState) => s.examPhase;
export const selectExamStep         = (s: AppState) => s.examStep;
export const selectFrozenResult     = (s: AppState) => s.frozenResult;
export const selectConfirmedViews   = (s: AppState) => s.confirmedViews;
export const selectSelectedProvider = (s: AppState) => s.selectedProvider;
export const selectHostedAvailable  = (s: AppState) => s.hostedAvailable;

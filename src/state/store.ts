/**
 * FAST-Assist Studio — Zustand State Store
 *
 * Single source of truth for all application state.
 * Uses immer-like shallow updates for maximum performance.
 */

import { create } from 'zustand';
import type {
  AppState,
  InferenceResult,
  ConnectionStatus,
  AppTheme,
  BackendType,
  PerformanceMetrics,
} from '@/types';
import { config } from '@/config';
import { ema } from '@/utils/smoothing';

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
}

const DEFAULT_METRICS: PerformanceMetrics = {
  fps:              0,
  inferenceLatency: 0,
  droppedFrames:    0,
  frameNumber:      0,
};

export const useAppStore = create<AppState & AppActions>()((set, get) => ({
  // ── Initial State ──────────────────────────────────────────────────────────
  isMockMode:        false,
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

  // ── Actions ────────────────────────────────────────────────────────────────

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

  setConnectionStatus(status) {
    set({ connectionStatus: status });
  },

  setMockMode(isMock) {
    set({
      isMockMode:       isMock,
      connectionStatus: isMock ? 'mock' : 'connected',
    });
  },

  setTheme(theme) {
    set({ theme });
    document.documentElement.classList.toggle('dark', theme === 'dark');
  },

  setFullscreen(isFullscreen) {
    set({ isFullscreen });
  },

  setInferring(isInferring) {
    set({ isInferring });
  },

  setVideoPlaying(isPlaying) {
    set({ isVideoPlaying: isPlaying });
  },

  setVideoTime(time) {
    set({ videoCurrentTime: time });
  },

  updateMetrics(partial) {
    set(state => ({ metrics: { ...state.metrics, ...partial } }));
  },

  setBackendType(type) {
    set({ backendType: type });
  },

  setInferenceInterval(ms) {
    set({ inferenceInterval: ms });
  },

  resetMetrics() {
    set({ metrics: { ...DEFAULT_METRICS } });
  },
}));

// Convenience selectors
export const selectResult    = (s: AppState) => s.currentResult;
export const selectMetrics   = (s: AppState) => s.metrics;
export const selectStatus    = (s: AppState) => s.connectionStatus;
export const selectIsMock    = (s: AppState) => s.isMockMode;
export const selectTheme     = (s: AppState) => s.theme;
export const selectIsFullscreen = (s: AppState) => s.isFullscreen;

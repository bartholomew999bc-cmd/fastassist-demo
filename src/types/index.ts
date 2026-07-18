/**
 * FAST-Assist Studio — Core Type Definitions
 *
 * All shared types and interfaces for the application.
 * Components and services depend on these types, never on each other's internals.
 */

// ─── Inference Schema ────────────────────────────────────────────────────────

/** Quality metadata returned by the AI inference backend */
export interface ImageQuality {
  overall: number; // 0–1
  motion: 'Stable' | 'Minor motion' | 'Motion artifact' | string;
  gain: 'Adequate' | 'Too high' | 'Too low' | string;
  depth: 'Optimal' | 'Too shallow' | 'Too deep' | string;
}

/** Canonical JSON contract. Every backend must return exactly this shape. */
export interface InferenceResult {
  timestamp: number;
  scan_view: string;
  confidence: number; // 0–1
  structures: string[];
  quality: ImageQuality;
  guidance: string;
  backend_latency: number; // ms
}

// ─── Video Source ─────────────────────────────────────────────────────────────

export type VideoSourceType = 'mp4' | 'hdmi' | 'usb' | 'webcam' | 'rtsp';

export interface VideoSource {
  type: VideoSourceType;
  label: string;
  /** Returns the current HTMLVideoElement, or null if not ready */
  getElement(): HTMLVideoElement | null;
  play(): Promise<void>;
  pause(): void;
  seek(time: number): void;
  /** Capture current frame as base64 JPEG data URL */
  captureFrame(): string | null;
}

// ─── Inference Backend ────────────────────────────────────────────────────────

export type BackendType = 'rest' | 'mock' | 'huggingface' | 'runpod' | 'openai' | 'tensorrt';

export interface InferenceBackend {
  readonly type: BackendType;
  readonly label: string;
  /** Send a frame (base64 data URL) and receive structured metadata */
  infer(frameDataUrl: string): Promise<InferenceResult>;
  /** Check if the backend is reachable */
  healthCheck(): Promise<boolean>;
}

// ─── Application State ────────────────────────────────────────────────────────

export type ConnectionStatus = 'connected' | 'mock' | 'connecting' | 'error';
export type AppTheme = 'dark' | 'light';

export interface PerformanceMetrics {
  fps: number;
  inferenceLatency: number;   // ms, smoothed
  droppedFrames: number;
  frameNumber: number;
}

export interface AppState {
  // Mode
  isMockMode: boolean;
  connectionStatus: ConnectionStatus;
  theme: AppTheme;
  isFullscreen: boolean;

  // Inference
  currentResult: InferenceResult | null;
  previousResult: InferenceResult | null;
  isInferring: boolean;

  // Performance
  metrics: PerformanceMetrics;

  // Config
  inferenceInterval: number; // ms
  backendType: BackendType;
  videoPath: string;
  endpointUrl: string;

  // Video
  isVideoPlaying: boolean;
  videoCurrentTime: number;
}

// ─── Log Entry ────────────────────────────────────────────────────────────────

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  category: string;
  message: string;
  data?: unknown;
}

// ─── Mock Scenario ────────────────────────────────────────────────────────────

export interface MockScenario {
  id: string;
  label: string;
  file: string; // path under /mock/
}

export const MOCK_SCENARIOS: MockScenario[] = [
  { id: 'ruq',           label: 'RUQ',            file: '/mock/ruq.json' },
  { id: 'luq',           label: 'LUQ',            file: '/mock/luq.json' },
  { id: 'pelvis',        label: 'Pelvis',          file: '/mock/pelvis.json' },
  { id: 'cardiac',       label: 'Cardiac',         file: '/mock/cardiac.json' },
  { id: 'positive_fast', label: 'FAST Positive',   file: '/mock/positive_fast.json' },
  { id: 'negative_fast', label: 'FAST Negative',   file: '/mock/negative_fast.json' },
  { id: 'poor_quality',  label: 'Poor Quality',    file: '/mock/poor_quality.json' },
];

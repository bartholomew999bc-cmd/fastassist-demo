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

// ─── Authorization ────────────────────────────────────────────────────────────

/**
 * Role assigned to an authorised user in Firestore.
 * Stored in authorized_users/{uid}.role.
 * Permissions are not yet enforced — role is stored for future use.
 */
export type UserRole = 'admin' | 'operator' | 'viewer';

/**
 * Auth state machine used by AuthProvider and ProtectedRoute.
 *   checking-auth          — Firebase resolving persisted session
 *   checking-authorization — Firebase user found; querying Firestore allowlist
 *   authorized             — User is on the allowlist and enabled
 *   unauthenticated        — No Firebase user (login page)
 *   access-denied          — Authenticated but not on allowlist / disabled
 *   error                  — Unexpected error during auth/authz
 */
export type AuthStatus =
  | 'checking-auth'
  | 'checking-authorization'
  | 'authorized'
  | 'unauthenticated'
  | 'access-denied'
  | 'error';

// ─── Inference Providers ──────────────────────────────────────────────────────

/**
 * User-facing provider selection.
 * Each value maps to a concrete InferenceBackend internally.
 * Future providers: 'huggingface' | 'openai' | 'gemini' | 'onnx' | 'tensorrt' | 'edge'
 */
export type ProviderType = 'hosted' | 'mock';

// ─── Inference Backend (internal) ────────────────────────────────────────────

/** @internal Implementation type used by service classes. */
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

/**
 * Effective connection status of the inference layer.
 *  connected  — Hosted AI is selected and reachable.
 *  fallback   — Hosted AI was selected but is unavailable; Mock Provider is serving.
 *  mock       — Mock Provider is explicitly selected by the operator.
 *  connecting — Initial health check in progress.
 *  error      — Unrecoverable failure.
 */
export type ConnectionStatus = 'connected' | 'mock' | 'connecting' | 'error' | 'fallback';

export type AppTheme = 'dark' | 'light';

export interface PerformanceMetrics {
  fps: number;
  inferenceLatency: number;   // ms, smoothed
  droppedFrames: number;
  frameNumber: number;
}

// ─── Examination Workflow ─────────────────────────────────────────────────────

/**
 * The operator-controlled examination state machine.
 * AI inference runs during 'acquiring'. On a high-confidence result the
 * workflow freezes at 'awaiting_confirmation' until the operator acts.
 */
export type ExamPhase = 'acquiring' | 'awaiting_confirmation';

/**
 * Full 11-state FAST examination session.
 * Controls which acquisition window is active and overall session progress.
 */
export type ExamSessionStep =
  | 'idle'
  | 'ready'
  | 'acquiring_ruq'
  | 'awaiting_ruq'
  | 'acquiring_luq'
  | 'awaiting_luq'
  | 'acquiring_pelvis'
  | 'awaiting_pelvis'
  | 'acquiring_cardiac'
  | 'awaiting_cardiac'
  | 'complete';

/** A single confirmed view in the exam session history */
export interface ConfirmedView {
  scanView:    string;
  confidence:  number;
  quality:     number;
  confirmedAt: number;
  result:      InferenceResult;
}

export interface AppState {
  // ── Authorization ───────────────────────────────────────────────────────────
  /** Role of the currently signed-in user, null when unauthenticated. */
  userRole: UserRole | null;

  // ── Provider selection ──────────────────────────────────────────────────────
  /** The provider the operator has explicitly selected. */
  selectedProvider: ProviderType;
  /**
   * True when the Hosted AI endpoint has been found reachable during a
   * recovery probe while the system is currently in fallback mode.
   * Signals to the UI that the operator can switch back manually.
   */
  hostedAvailable: boolean;

  // ── Connection / mode (derived from provider state) ─────────────────────────
  /** Effective connection status — reflects what is actually serving frames. */
  connectionStatus: ConnectionStatus;
  /**
   * True when the mock backend is currently serving frames, regardless of
   * whether that is by selection or automatic fallback.
   */
  isMockMode: boolean;

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

  // Examination workflow
  examPhase:      ExamPhase;
  examStep:       ExamSessionStep;
  frozenResult:   InferenceResult | null;
  confirmedViews: ConfirmedView[];

  // ── Developer inspector ─────────────────────────────────────────────────────
  /** Whether the Inspector drawer is currently expanded. */
  inspectorOpen: boolean;
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

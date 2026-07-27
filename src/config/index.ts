/**
 * FAST-Assist Studio — Application Configuration
 *
 * All runtime constants are defined here.
 * No hardcoded values in components or services.
 */

import type { BackendType, AppTheme, ProviderType } from '@/types';

export interface AppConfig {
  /**
   * The inference provider the application selects on startup.
   * Operators can switch providers at runtime via the UI selector.
   *   'hosted' — attempt the configured hosted AI endpoint; fall back to mock on failure.
   *   'mock'   — always use the mock provider (offline demonstration / development).
   */
  defaultProvider: ProviderType;
  /** Base URL for the hosted AI inference REST endpoint */
  endpointUrl: string;
  /** How often to capture and send a frame, in ms */
  inferenceInterval: number;
  /** Path to the demo ultrasound video */
  videoPath: string;
  /** @deprecated Use defaultProvider instead. Retained for internal BackendFactory compat. */
  demoMode: boolean;
  /** Visual theme */
  theme: AppTheme;
  /** Enable verbose debug logging */
  debug: boolean;
  /** @internal Starting backend type (maps from defaultProvider) */
  defaultBackend: BackendType;
  /** Confidence smoothing factor (0–1, higher = more smoothing) */
  confidenceSmoothFactor: number;
  /** How many log entries to retain in memory */
  maxLogEntries: number;

  /**
   * Minimum AI confidence (0–1) required to freeze the workflow and
   * present the "Awaiting Operator Confirmation" prompt.
   */
  confirmConfidenceThreshold: number;
  /**
   * Minimum image quality score (0–1) required to freeze the workflow.
   * Both this AND confirmConfidenceThreshold must be met.
   */
  confirmQualityThreshold: number;
}

export const config: AppConfig = {
  defaultProvider:   (import.meta.env.VITE_PROVIDER as ProviderType) ?? 'hosted',
  endpointUrl:       import.meta.env.VITE_INFERENCE_ENDPOINT ?? '/infer',
  inferenceInterval: import.meta.env.VITE_INFERENCE_INTERVAL
                       ? Number(import.meta.env.VITE_INFERENCE_INTERVAL)
                       : 1200,
  videoPath:         import.meta.env.VITE_VIDEO_PATH  ?? '/videos/ultrasound.mp4',
  demoMode:          import.meta.env.VITE_DEMO_MODE   === 'true',
  theme:             (import.meta.env.VITE_THEME as AppTheme) ?? 'dark',
  debug:             import.meta.env.VITE_DEBUG        === 'true',
  // Internal: 'hosted' maps to 'rest'; 'mock' maps to 'mock'
  defaultBackend:    ((import.meta.env.VITE_PROVIDER as ProviderType) ?? 'hosted') === 'mock'
                       ? 'mock'
                       : 'rest',
  confidenceSmoothFactor: 0.3,
  maxLogEntries:          500,

  // Examination workflow thresholds
  confirmConfidenceThreshold: 0.85,
  confirmQualityThreshold:    0.75,
};

/** Application version — kept in sync with package.json */
export const APP_VERSION = '0.2.0';
export const APP_NAME    = 'FAST-Assist Studio';
export const APP_TAGLINE = 'Vendor-Agnostic AI Ultrasound Assistant';

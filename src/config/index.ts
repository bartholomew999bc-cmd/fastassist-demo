/**
 * FAST-Assist Studio — Application Configuration
 *
 * All runtime constants are defined here.
 * No hardcoded values in components or services.
 *
 * Environment variables (VITE_ prefix, set at build time):
 *   VITE_OPENROUTER_API_KEY  — OpenRouter API key; absent → Mock Mode
 *   VITE_PROVIDER            — Default provider: 'hosted' | 'mock'
 *   VITE_INFERENCE_ENDPOINT  — REST endpoint URL (RESTBackend only)
 *   VITE_INFERENCE_INTERVAL  — Frame capture interval in ms
 *   VITE_VIDEO_PATH          — Path to demo video in /public
 *   VITE_THEME               — Default theme: 'dark' | 'light'
 *   VITE_DEBUG               — Enable verbose logging: 'true' | 'false'
 *
 * See .env.example for full documentation.
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

  /**
   * True when VITE_OPENROUTER_API_KEY is present at build time.
   * Used to show a subtle "No API key" indicator in the UI.
   * Never exposes the key value itself.
   */
  hasHostedAI: boolean;
}

const _provider: ProviderType = (import.meta.env.VITE_PROVIDER as ProviderType) ?? 'hosted';
const _apiKey: string          = import.meta.env.VITE_OPENROUTER_API_KEY ?? '';

export const config: AppConfig = {
  defaultProvider:   _provider,
  endpointUrl:       import.meta.env.VITE_INFERENCE_ENDPOINT ?? '/infer',
  inferenceInterval: import.meta.env.VITE_INFERENCE_INTERVAL
                       ? Number(import.meta.env.VITE_INFERENCE_INTERVAL)
                       : 1200,
  videoPath:         import.meta.env.VITE_VIDEO_PATH  ?? '/videos/ultrasound.mp4',
  demoMode:          import.meta.env.VITE_DEMO_MODE   === 'true',
  theme:             (import.meta.env.VITE_THEME as AppTheme) ?? 'dark',
  debug:             import.meta.env.VITE_DEBUG        === 'true',
  // Internal: 'hosted' maps to 'rest'; 'mock' maps to 'mock'
  defaultBackend:    _provider === 'mock' ? 'mock' : 'rest',
  confidenceSmoothFactor: 0.3,
  maxLogEntries:          500,

  // Examination workflow thresholds
  confirmConfidenceThreshold: 0.85,
  confirmQualityThreshold:    0.75,

  // Presence-only check — never expose the key value
  hasHostedAI: _apiKey.length > 0,
};

/** Application version — kept in sync with package.json */
export const APP_VERSION = '0.2.0';
export const APP_NAME    = 'FAST-Assist Studio';
export const APP_TAGLINE = 'Vendor-Agnostic AI Ultrasound Assistant';

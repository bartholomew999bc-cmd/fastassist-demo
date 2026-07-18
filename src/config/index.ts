/**
 * FAST-Assist Studio — Application Configuration
 *
 * All runtime constants are defined here.
 * No hardcoded values in components or services.
 */

import type { BackendType, AppTheme } from '@/types';

export interface AppConfig {
  /** Base URL for the AI inference REST endpoint */
  endpointUrl: string;
  /** How often to capture and send a frame, in ms */
  inferenceInterval: number;
  /** Path to the demo ultrasound video */
  videoPath: string;
  /** Whether to force mock mode regardless of endpoint availability */
  demoMode: boolean;
  /** Visual theme */
  theme: AppTheme;
  /** Enable verbose debug logging */
  debug: boolean;
  /** Starting backend type */
  defaultBackend: BackendType;
  /** Confidence smoothing factor (0–1, higher = more smoothing) */
  confidenceSmoothFactor: number;
  /** How many log entries to retain in memory */
  maxLogEntries: number;
}

export const config: AppConfig = {
  endpointUrl:           import.meta.env.VITE_INFERENCE_ENDPOINT ?? '/infer',
  inferenceInterval:     import.meta.env.VITE_INFERENCE_INTERVAL  ? Number(import.meta.env.VITE_INFERENCE_INTERVAL) : 1200,
  videoPath:             import.meta.env.VITE_VIDEO_PATH           ?? '/videos/ultrasound.mp4',
  demoMode:              import.meta.env.VITE_DEMO_MODE            === 'true',
  theme:                 (import.meta.env.VITE_THEME as AppTheme)  ?? 'dark',
  debug:                 import.meta.env.VITE_DEBUG                === 'true',
  defaultBackend:        (import.meta.env.VITE_BACKEND as BackendType) ?? 'rest',
  confidenceSmoothFactor: 0.3,
  maxLogEntries:         500,
};

/** Application version — kept in sync with package.json */
export const APP_VERSION = '0.1.0';
export const APP_NAME    = 'FAST-Assist Studio';
export const APP_TAGLINE = 'Vendor-Agnostic AI Ultrasound Assistant';

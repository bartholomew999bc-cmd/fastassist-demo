/**
 * FAST-Assist Studio — Mock Inference Backend
 *
 * Loads pre-authored JSON metadata from /public/mock/*.json.
 *
 * When pinned to a window (via pinToWindow), always returns that scenario so
 * the examination workflow is driven by operator confirmation rather than
 * automatic scenario cycling.  When unpinned, cycles through all scenarios
 * (legacy / diagnostic behaviour).
 */

import type { InferenceBackend, InferenceResult, BackendType } from '@/types';
import { MOCK_SCENARIOS } from '@/types';
import { logger } from '@/utils/logger';

const FALLBACK: InferenceResult = {
  timestamp:       0,
  scan_view:       'RUQ',
  confidence:      0.92,
  structures:      ['Liver', 'Kidney', 'Diaphragm'],
  quality: {
    overall: 0.88,
    motion:  'Stable',
    gain:    'Adequate',
    depth:   'Optimal',
  },
  guidance:         'Hold probe steady. Good acoustic window.',
  backend_latency:  45,
};

export class MockBackend implements InferenceBackend {
  readonly type: BackendType = 'mock';
  readonly label = 'Mock Backend';

  private scenarioIndex  = 0;
  private pinnedId: string | null = null;
  private cachedScenarios: Map<string, InferenceResult> = new Map();

  /**
   * Pin the backend to a specific scenario by id (e.g. 'ruq', 'luq').
   * While pinned, every infer() call returns that scenario rather than cycling.
   * Pass null to revert to round-robin cycling.
   */
  pinToWindow(scenarioId: string | null): void {
    if (this.pinnedId !== scenarioId) {
      this.pinnedId = scenarioId;
      logger.debug('MockBackend', `Pinned to window: ${scenarioId ?? '(cycling)'}`);
    }
  }

  async infer(_frameDataUrl: string): Promise<InferenceResult> {
    // When pinned, serve the exam-window scenario exclusively.
    // When unpinned, cycle through all scenarios (legacy behaviour).
    let scenario = this.pinnedId
      ? MOCK_SCENARIOS.find(s => s.id === this.pinnedId)
      : undefined;

    if (!scenario) {
      scenario = MOCK_SCENARIOS[this.scenarioIndex % MOCK_SCENARIOS.length];
      this.scenarioIndex++;
    }

    // Use cache if available
    const cached = this.cachedScenarios.get(scenario.id);
    if (cached) {
      return this.stamp(cached);
    }

    // Fetch from public/mock/
    try {
      const response = await fetch(scenario.file);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: InferenceResult = await response.json();
      this.cachedScenarios.set(scenario.id, data);
      logger.debug('MockBackend', `Loaded scenario: ${scenario.label}`);
      return this.stamp(data);
    } catch (err) {
      logger.warn('MockBackend', `Failed to load ${scenario.file}, using fallback`, err);
      return this.stamp(FALLBACK);
    }
  }

  async healthCheck(): Promise<boolean> {
    return true; // Mock is always available
  }

  /** Stamp result with current timestamp and simulated latency */
  private stamp(result: InferenceResult): InferenceResult {
    return {
      ...result,
      timestamp:       Date.now(),
      backend_latency: 30 + Math.round(Math.random() * 60), // 30–90 ms
    };
  }
}

/**
 * FAST-Assist Studio — REST Inference Backend
 *
 * POSTs the current frame to a configurable HTTP endpoint.
 * Expects the canonical InferenceResult JSON schema in response.
 * Throws on network errors so the caller can fall back to mock mode.
 */

import axios from 'axios';
import type { InferenceBackend, InferenceResult, BackendType } from '@/types';
import { logger } from '@/utils/logger';

export class RESTBackend implements InferenceBackend {
  readonly type: BackendType = 'rest';
  readonly label: string;

  constructor(
    private readonly endpointUrl: string,
    private readonly timeoutMs = 5000
  ) {
    this.label = `REST (${endpointUrl})`;
  }

  async infer(frameDataUrl: string): Promise<InferenceResult> {
    const start = performance.now();

    const response = await axios.post<InferenceResult>(
      this.endpointUrl,
      { frame: frameDataUrl, timestamp: Date.now() },
      {
        timeout: this.timeoutMs,
        headers: { 'Content-Type': 'application/json' },
      }
    );

    const elapsed = Math.round(performance.now() - start);
    logger.debug('RESTBackend', `Inference completed in ${elapsed} ms`);

    return {
      ...response.data,
      backend_latency: response.data.backend_latency ?? elapsed,
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      // POST a minimal payload and verify the response is valid JSON with expected schema
      const response = await axios.post<unknown>(
        this.endpointUrl,
        { frame: 'data:image/jpeg;base64,/9j/4A==', timestamp: Date.now(), healthCheck: true },
        { timeout: 3000, headers: { 'Content-Type': 'application/json' } }
      );

      // Reject SPA HTML fallbacks — must be JSON with expected keys
      const ct = String(response.headers['content-type'] ?? '');
      if (!ct.includes('application/json')) {
        logger.warn('RESTBackend', 'Endpoint returned non-JSON — falling back to mock');
        return false;
      }

      const data = response.data as Record<string, unknown>;
      const hasSchema = typeof data === 'object' && data !== null
        && 'scan_view' in data
        && 'confidence' in data;

      if (!hasSchema) {
        logger.warn('RESTBackend', 'Response missing expected schema — falling back to mock');
        return false;
      }

      return true;
    } catch {
      logger.warn('RESTBackend', 'Health check failed — switching to mock mode');
      return false;
    }
  }
}

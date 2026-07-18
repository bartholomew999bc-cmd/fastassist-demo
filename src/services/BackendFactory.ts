/**
 * FAST-Assist Studio — Backend Factory
 *
 * Creates InferenceBackend instances by type.
 * Adding a new backend requires only adding a case here.
 */

import type { InferenceBackend, BackendType } from '@/types';
import { RESTBackend } from './RESTBackend';
import { MockBackend } from './MockBackend';

export interface BackendOptions {
  type: BackendType;
  endpointUrl?: string;
}

export function createBackend(options: BackendOptions): InferenceBackend {
  switch (options.type) {
    case 'rest':
      return new RESTBackend(options.endpointUrl ?? '/infer');
    case 'mock':
      return new MockBackend();
    // Future backends — uncomment when implemented:
    // case 'huggingface': return new HuggingFaceBackend(options.endpointUrl!);
    // case 'runpod':      return new RunPodBackend(options.endpointUrl!);
    // case 'openai':      return new OpenAIBackend(options.endpointUrl!);
    // case 'tensorrt':    return new TensorRTBackend(options.endpointUrl!);
    default:
      return new MockBackend();
  }
}

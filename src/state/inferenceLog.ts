/**
 * FAST-Assist Studio — Inference Session Log (RC3)
 *
 * Rolling in-memory Zustand store of the last MAX_ENTRIES FullInferenceResult
 * objects from the hosted provider.  Consumed exclusively by InspectorPanel.
 * The workflow layer never touches this store.
 */

import { create } from 'zustand';
import type { FullInferenceResult } from '@/types/inference';

const MAX_ENTRIES = 200;
let counter = 0;

export interface LoggedInference {
  id:          string;
  frameNumber: number;
  result:      FullInferenceResult;
}

interface InferenceLogState {
  entries: LoggedInference[];
  append(frameNumber: number, result: FullInferenceResult): void;
  clear(): void;
}

export const useInferenceLog = create<InferenceLogState>()((set) => ({
  entries: [],

  append(frameNumber, result) {
    set(state => {
      const entry: LoggedInference = {
        id:          `inf-${(++counter).toString().padStart(4, '0')}`,
        frameNumber,
        result,
      };
      const next = [...state.entries, entry];
      // Keep rolling window
      if (next.length > MAX_ENTRIES) next.splice(0, next.length - MAX_ENTRIES);
      return { entries: next };
    });
  },

  clear() { set({ entries: [] }); },
}));

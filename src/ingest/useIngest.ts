/**
 * FAST-Assist Studio — useIngestManager
 *
 * Accessor hook for the VideoIngestManager singleton provided by IngestProvider.
 * Separated from IngestContext.tsx so that file only exports a component,
 * satisfying react-refresh/only-export-components.
 */

import { useContext } from 'react';
import { IngestContext } from './IngestContextDef';

/**
 * Access the VideoIngestManager from any component inside IngestProvider.
 * For most components, prefer the higher-level `useIngest` hook instead.
 */
export function useIngestManager() {
  const manager = useContext(IngestContext);
  if (!manager) {
    throw new Error('useIngestManager must be called inside <IngestProvider>');
  }
  return manager;
}

/**
 * FAST-Assist Studio — Ingest Pipeline React Context
 *
 * Provides a shared VideoIngestManager singleton to all components.
 * On mount, starts the pipeline with the configured demo video source.
 * On unmount, disposes the manager and all held resources.
 */

import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { VideoIngestManager } from './VideoIngestManager';
import { DemoVideoSource }    from './sources/DemoVideoSource';
import { config as appConfig } from '@/config';
import { logger }             from '@/utils/logger';

// ─── Context ──────────────────────────────────────────────────────────────────

const IngestContext = createContext<VideoIngestManager | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

interface IngestProviderProps {
  children: ReactNode;
}

export function IngestProvider({ children }: IngestProviderProps) {
  const managerRef = useRef<VideoIngestManager | null>(null);

  // Create manager once on mount
  if (!managerRef.current) {
    managerRef.current = new VideoIngestManager({
      queueCapacity:     8,
      queueMaxAgeMs:     3000,
      preprocessWidth:   640,
      preprocessHeight:  480,
      preprocessQuality: 0.82,
    });
  }

  useEffect(() => {
    const manager = managerRef.current!;

    // Start with the demo video source
    const demoSource = new DemoVideoSource({
      url:      appConfig.videoPath,
      loop:     true,
      autoPlay: true,
    });

    manager.switchSource(demoSource).catch(err => {
      logger.warn('IngestContext', 'Failed to start demo source — synthetic canvas will be used', err);
      // SourceRenderer falls back to SyntheticUltrasound when no source is connected
    });

    return () => {
      manager.dispose();
      managerRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <IngestContext.Provider value={managerRef.current}>
      {children}
    </IngestContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Access the VideoIngestManager from any component inside IngestProvider.
 * For most components, prefer the higher-level `useIngest` hook instead.
 */
export function useIngestManager(): VideoIngestManager {
  const manager = useContext(IngestContext);
  if (!manager) {
    throw new Error('useIngestManager must be called inside <IngestProvider>');
  }
  return manager;
}

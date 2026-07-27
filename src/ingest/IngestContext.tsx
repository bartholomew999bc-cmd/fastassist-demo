/**
 * FAST-Assist Studio — Ingest Pipeline React Context
 *
 * Provides a shared VideoIngestManager singleton to all components.
 * On mount, starts the pipeline with the configured demo video source.
 * If the demo video is unavailable, automatically falls back to the
 * synthetic canvas source so the extractor loop always starts.
 * On unmount, disposes the manager and all held resources.
 */

import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { VideoIngestManager } from './VideoIngestManager';
import { DemoVideoSource }    from './sources/DemoVideoSource';
import { SyntheticSource }    from './sources/SyntheticSource';
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

  // Create manager once on mount (before first render so context value is stable)
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

    const startPipeline = async () => {
      // Try the configured demo video first. If the file is missing the
      // DemoVideoSource will connect successfully (connection is synchronous)
      // but the video element will fire an error event when the URL 404s.
      // That error is handled by SourceRenderer, which calls switchSource
      // to SyntheticSource. So we always start with DemoVideoSource here;
      // the React component layer handles the fallback gracefully.
      //
      // If even the DemoVideoSource fails to initialise (bad config etc.),
      // fall through to SyntheticSource immediately.
      try {
        const demoSource = new DemoVideoSource({
          url:      appConfig.videoPath,
          loop:     true,
          autoPlay: true,
        });
        await manager.switchSource(demoSource);
        logger.info('IngestContext', `Pipeline started — demo source (${appConfig.videoPath})`);
      } catch (err) {
        logger.warn('IngestContext', 'Demo source failed to initialise — starting synthetic', err);
        await manager.switchSource(new SyntheticSource());
      }
    };

    void startPipeline();

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

// ─── Hooks ────────────────────────────────────────────────────────────────────

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

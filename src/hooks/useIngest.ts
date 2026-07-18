/**
 * FAST-Assist Studio — useIngest Hook
 *
 * React interface to the VideoIngestManager. Provides reactive state
 * (active source kind, status, diagnostics) and imperative actions
 * (switchToSource, play, pause, stop, seek).
 *
 * Diagnostics are polled every 500 ms. Source state changes are
 * delivered immediately via the ingestBus event system.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useIngestManager } from '@/ingest/IngestContext';
import { DemoVideoSource }  from '@/ingest/sources/DemoVideoSource';
import { UploadVideoSource } from '@/ingest/sources/UploadVideoSource';
import { WebcamSource }     from '@/ingest/sources/WebcamSource';
import { MJPEGSource }      from '@/ingest/sources/MJPEGSource';
import { RTSPSource }       from '@/ingest/sources/RTSPSource';
import { DicomCineSource }  from '@/ingest/sources/DicomCineSource';
import { ingestBus }        from '@/ingest/IngestEvents';
import type { IngestDiagnostics } from '@/ingest/VideoIngestManager';
import type { SourceKind, SourceStatus } from '@/ingest/IVideoSource';
import type { CameraDevice } from '@/ingest/sources/WebcamSource';
import { config as appConfig } from '@/config';
import { logger } from '@/utils/logger';

// ─── Switch config (discriminated union for type safety) ──────────────────────

export type SwitchConfig =
  | { kind: 'demo';      url?: string }
  | { kind: 'upload';    file: File }
  | { kind: 'webcam';    deviceId?: string; width?: number; height?: number; frameRate?: number }
  | { kind: 'mjpeg';     url: string }
  | { kind: 'rtsp';      url: string }
  | { kind: 'dicom' }
  | { kind: 'synthetic' };

// ─── Hook state ───────────────────────────────────────────────────────────────

export interface IngestState {
  activeKind:   SourceKind | null;
  sourceStatus: SourceStatus;
  sourceLabel:  string;
  isConnecting: boolean;
  error:        string | null;
  diagnostics:  IngestDiagnostics | null;
}

export interface IngestActions {
  switchToSource(cfg: SwitchConfig): Promise<void>;
  play():                            void;
  pause():                           void;
  stop():                            void;
  seek(seconds: number):             void;
  setPlaybackSpeed(rate: number):    void;
  enumerateCameras(): Promise<CameraDevice[]>;
  clearError():                      void;
}

const INITIAL_STATE: IngestState = {
  activeKind:   null,
  sourceStatus: 'idle',
  sourceLabel:  '—',
  isConnecting: false,
  error:        null,
  diagnostics:  null,
};

// ─── Hook implementation ──────────────────────────────────────────────────────

export function useIngest(): IngestState & IngestActions {
  const manager = useIngestManager();
  const [state, setState] = useState<IngestState>(INITIAL_STATE);
  const switchingRef = useRef(false);

  // ── Event subscriptions ───────────────────────────────────────────────────

  useEffect(() => {
    const offs = [
      ingestBus.on('SourceConnected', ({ kind, label }) => {
        setState(s => ({
          ...s,
          activeKind:   kind,
          sourceStatus: 'connected',
          sourceLabel:  label,
          isConnecting: false,
          error:        null,
        }));
      }),
      ingestBus.on('SourceDisconnected', ({ kind }) => {
        setState(s => ({ ...s, sourceStatus: 'disconnected', activeKind: kind }));
      }),
      ingestBus.on('StatusChanged', ({ status }) => {
        setState(s => ({ ...s, sourceStatus: status }));
      }),
      ingestBus.on('ErrorOccurred', ({ error }) => {
        setState(s => ({ ...s, error: error.message, isConnecting: false, sourceStatus: 'error' }));
      }),
      ingestBus.on('PlaybackStarted', ({ kind }) => {
        setState(s => ({ ...s, sourceStatus: 'playing', activeKind: kind }));
      }),
      ingestBus.on('PlaybackPaused', () => {
        setState(s => ({ ...s, sourceStatus: 'paused' }));
      }),
      ingestBus.on('PlaybackStopped', () => {
        setState(s => ({ ...s, sourceStatus: 'stopped' }));
      }),
    ];

    // Poll diagnostics every 500 ms
    const pollId = setInterval(() => {
      setState(s => ({
        ...s,
        diagnostics: manager.getDiagnostics(),
      }));
    }, 500);

    return () => {
      offs.forEach(off => off());
      clearInterval(pollId);
    };
  }, [manager]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const switchToSource = useCallback(async (cfg: SwitchConfig): Promise<void> => {
    if (switchingRef.current) return;
    switchingRef.current = true;
    setState(s => ({ ...s, isConnecting: true, error: null }));

    try {
      if (cfg.kind === 'synthetic') {
        // Synthetic is purely React-rendered; just update state
        setState(s => ({
          ...s,
          activeKind:   'synthetic',
          sourceStatus: 'playing',
          sourceLabel:  'Synthetic Ultrasound',
          isConnecting: false,
        }));
        return;
      }

      let source;
      switch (cfg.kind) {
        case 'demo':
          source = new DemoVideoSource({ url: cfg.url ?? appConfig.videoPath, loop: true, autoPlay: true });
          break;
        case 'upload':
          source = new UploadVideoSource(cfg.file);
          break;
        case 'webcam':
          source = new WebcamSource({
            deviceId:  cfg.deviceId,
            width:     cfg.width,
            height:    cfg.height,
            frameRate: cfg.frameRate,
          });
          break;
        case 'mjpeg':
          source = new MJPEGSource({ url: cfg.url });
          break;
        case 'rtsp':
          source = new RTSPSource({ url: cfg.url });
          break;
        case 'dicom':
          source = new DicomCineSource();
          break;
        default:
          throw new Error(`Unknown source kind: ${(cfg as { kind: string }).kind}`);
      }

      await manager.switchSource(source);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('useIngest', 'switchToSource failed', err);
      setState(s => ({ ...s, isConnecting: false, error: msg }));
    } finally {
      switchingRef.current = false;
    }
  }, [manager]);

  const play             = useCallback(() => manager.play(),                 [manager]);
  const pause            = useCallback(() => manager.pause(),                [manager]);
  const stop             = useCallback(() => manager.stop(),                 [manager]);
  const seek             = useCallback((s: number) => manager.seek(s),      [manager]);
  const setPlaybackSpeed = useCallback((r: number) => manager.setPlaybackSpeed(r), [manager]);

  const enumerateCameras = useCallback(() => WebcamSource.enumerateCameras(), []);

  const clearError = useCallback(() => {
    setState(s => ({ ...s, error: null }));
  }, []);

  return {
    ...state,
    switchToSource,
    play, pause, stop, seek,
    setPlaybackSpeed,
    enumerateCameras,
    clearError,
  };
}

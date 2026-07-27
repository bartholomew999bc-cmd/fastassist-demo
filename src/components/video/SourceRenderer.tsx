/**
 * FAST-Assist Studio — Source Renderer
 *
 * Renders the correct DOM element for whatever IVideoSource is currently active.
 * The active element is always published at id="fast-assist-video" so the
 * FrameExtractor can find it without any direct coupling to this component.
 *
 * Source kind → rendered element:
 *   demo / upload  → <video src={url} />
 *   webcam         → <video srcObject={MediaStream} />
 *   synthetic      → <SyntheticUltrasound /> (canvas)
 *   null / other   → <SyntheticUltrasound /> (safe fallback)
 *
 * When a demo video fails to load (missing file etc.) this component
 * transparently switches the ingest manager to SyntheticSource so the
 * pipeline continues without interruption.
 */

import { useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RiPlayCircleLine, RiPauseCircleLine } from 'react-icons/ri';
import { useIngest } from '@/hooks/useIngest';
import { useIngestManager } from '@/ingest/IngestContext';
import { SyntheticSource } from '@/ingest/sources/SyntheticSource';
import { SyntheticUltrasound } from './SyntheticUltrasound';
import { useAppStore } from '@/state/store';
import { logger } from '@/utils/logger';

interface Props {
  className?: string;
}

export function SourceRenderer({ className = '' }: Props) {
  const { activeKind } = useIngest();

  // Render the appropriate sub-component keyed by source kind so React
  // fully unmounts/remounts the DOM element when the source type changes.
  const key = activeKind ?? 'none';

  if (activeKind === 'demo' || activeKind === 'upload') {
    return <VideoSourceRenderer key={key} className={className} />;
  }

  if (activeKind === 'webcam') {
    return <WebcamSourceRenderer key={key} className={className} />;
  }

  // synthetic / null / mjpeg / rtsp / dicom all render the canvas fallback.
  // mjpeg and rtsp manage their own stream parsing; a dedicated canvas
  // render path for those sources is a future enhancement.
  return <SyntheticRenderer key={key} className={className} />;
}

// ─── Synthetic / canvas renderer ─────────────────────────────────────────────

function SyntheticRenderer({ className }: { className: string }) {
  return (
    <div className={`relative ${className}`}>
      <SyntheticUltrasound className="w-full h-full" />
      <ScanLineOverlay opacity={0.5} />
    </div>
  );
}

// ─── File-based video renderer (demo + upload) ────────────────────────────────

function VideoSourceRenderer({ className }: { className: string }) {
  const videoRef  = useRef<HTMLVideoElement>(null);
  const manager   = useIngestManager();
  const { activeKind } = useIngest();
  const { isVideoPlaying, setVideoPlaying, setVideoTime } = useAppStore();

  // Resolve the URL from the active source.
  // Use undefined (not '') when no URL is available so the browser does not
  // attempt to fetch the page itself as the video resource.
  const url = manager.getActiveSource()?.getUrl?.() || undefined;

  // Auto-play once the video can play
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    const onCanPlay = () => {
      logger.info('SourceRenderer', 'Video ready — starting playback');
      setVideoPlaying(true);
      el.play().catch(err => {
        logger.warn('SourceRenderer', 'play() rejected', err);
        setVideoPlaying(false);
      });
    };

    const onError = () => {
      logger.warn('SourceRenderer', 'Video load failed — switching to synthetic source');
      setVideoPlaying(false);
      // Transparently fall back to the synthetic canvas source
      manager.switchSource(new SyntheticSource()).catch(e =>
        logger.error('SourceRenderer', 'Failed to switch to synthetic source', e)
      );
    };

    el.addEventListener('canplay',  onCanPlay, { once: true });
    el.addEventListener('error',    onError,   { once: true });

    return () => {
      el.removeEventListener('canplay', onCanPlay);
      el.removeEventListener('error',   onError);
    };
  }, [url, manager, setVideoPlaying]);

  // Track current time for store consumers
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const onTime = () => setVideoTime(el.currentTime);
    el.addEventListener('timeupdate', onTime);
    return () => el.removeEventListener('timeupdate', onTime);
  }, [setVideoTime]);

  // Sync play / pause from store → element
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (isVideoPlaying) {
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, [isVideoPlaying]);

  const togglePlayback = useCallback(() => {
    setVideoPlaying(!isVideoPlaying);
  }, [isVideoPlaying, setVideoPlaying]);

  return (
    <div className={`relative group ${className}`} onClick={togglePlayback}>
      <video
        id="fast-assist-video"
        ref={videoRef}
        src={url}
        className="w-full h-full object-contain"
        loop={activeKind === 'demo'}
        muted
        playsInline
        preload="auto"
        disablePictureInPicture
      />

      <ScanLineOverlay opacity={0.6} />

      {/* Paused state indicator */}
      <AnimatePresence>
        {!isVideoPlaying && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
          >
            <div className="w-16 h-16 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center border border-white/10">
              <RiPlayCircleLine className="text-white/80" size={32} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hover pause hint */}
      {isVideoPlaying && (
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <div className="w-12 h-12 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center">
            <RiPauseCircleLine className="text-white/60" size={24} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Live webcam / MediaStream renderer ──────────────────────────────────────

function WebcamSourceRenderer({ className }: { className: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const manager  = useIngestManager();
  const { setVideoPlaying } = useAppStore();

  // Attach MediaStream to the video element
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    const stream = manager.getActiveSource()?.getMediaStream?.() ?? null;
    if (!stream) return;

    el.srcObject = stream;
    el.play()
      .then(() => setVideoPlaying(true))
      .catch(err => logger.warn('SourceRenderer', 'Webcam play() rejected', err));

    return () => {
      el.srcObject = null;
      setVideoPlaying(false);
    };
  }, [manager, setVideoPlaying]);

  return (
    <div className={`relative ${className}`}>
      <video
        id="fast-assist-video"
        ref={videoRef}
        className="w-full h-full object-contain"
        muted
        playsInline
        autoPlay
        disablePictureInPicture
      />
      <ScanLineOverlay opacity={0.6} />
    </div>
  );
}

// ─── Shared decorations ───────────────────────────────────────────────────────

function ScanLineOverlay({ opacity }: { opacity: number }) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <div className="scan-line absolute inset-x-0 h-1/3" style={{ opacity }} />
    </div>
  );
}

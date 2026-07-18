/**
 * FAST-Assist Studio — Video Player
 *
 * Attempts to play an MP4 video source. If the source fails to load or play,
 * automatically falls back to the SyntheticUltrasound canvas renderer.
 *
 * The active element (video or canvas) is exposed via id="fast-assist-video"
 * so the frame capture service can find it without any coupling.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RiPlayCircleLine, RiPauseCircleLine } from 'react-icons/ri';
import { useAppStore } from '@/state/store';
import { SyntheticUltrasound } from './SyntheticUltrasound';
import { logger } from '@/utils/logger';

interface Props {
  className?: string;
}

export function VideoPlayer({ className = '' }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoFailed, setVideoFailed] = useState(false);
  const { videoPath, isVideoPlaying, setVideoPlaying, setVideoTime } = useAppStore();

  // Sync play state from store → video element
  useEffect(() => {
    if (videoFailed) return;
    const video = videoRef.current;
    if (!video) return;

    if (isVideoPlaying) {
      video.play().catch(err => {
        logger.warn('VideoPlayer', 'play() rejected', err);
        setVideoPlaying(false);
      });
    } else {
      video.pause();
    }
  }, [isVideoPlaying, videoFailed, setVideoPlaying]);

  // Track current time
  useEffect(() => {
    if (videoFailed) return;
    const video = videoRef.current;
    if (!video) return;
    const onTimeUpdate = () => setVideoTime(video.currentTime);
    video.addEventListener('timeupdate', onTimeUpdate);
    return () => video.removeEventListener('timeupdate', onTimeUpdate);
  }, [videoFailed, setVideoTime]);

  // Auto-play on mount
  useEffect(() => {
    if (videoFailed) return;
    const video = videoRef.current;
    if (!video) return;

    const onCanPlay = () => {
      logger.info('VideoPlayer', 'MP4 ready — starting playback');
      setVideoPlaying(true);
    };

    const onError = () => {
      logger.warn('VideoPlayer', 'MP4 load failed — switching to synthetic ultrasound');
      setVideoPlaying(false);
      setVideoFailed(true);
    };

    video.addEventListener('canplay', onCanPlay, { once: true });
    video.addEventListener('error', onError, { once: true });

    return () => {
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('error', onError);
    };
  }, [videoFailed, setVideoPlaying]);

  const togglePlayback = useCallback(() => {
    if (!videoFailed) setVideoPlaying(!isVideoPlaying);
  }, [isVideoPlaying, videoFailed, setVideoPlaying]);

  // ── Synthetic canvas fallback ───────────────────────────────────────────────
  if (videoFailed) {
    return (
      <div className={`relative ${className}`}>
        <SyntheticUltrasound className="w-full h-full" />
        {/* Subtle scan-line animation */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="scan-line absolute inset-x-0 h-1/3 opacity-50" />
        </div>
      </div>
    );
  }

  // ── MP4 video ──────────────────────────────────────────────────────────────
  return (
    <div className={`relative group ${className}`} onClick={togglePlayback}>
      <video
        id="fast-assist-video"
        ref={videoRef}
        src={videoPath}
        className="w-full h-full object-contain"
        loop
        muted
        playsInline
        preload="auto"
        disablePictureInPicture
      />

      {/* Subtle scan-line animation */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="scan-line absolute inset-x-0 h-1/3 opacity-60" />
      </div>

      {/* Paused state overlay */}
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

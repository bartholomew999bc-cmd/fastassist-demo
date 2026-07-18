/**
 * FAST-Assist Studio — Splash Screen
 *
 * Shown on launch. Fades in elegantly, then fades out to reveal the studio.
 * Self-dismisses after the loading sequence completes.
 */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { APP_NAME, APP_TAGLINE, APP_VERSION } from '@/config';

interface Props {
  onComplete: () => void;
}

const STAGES = [
  'Initialising AI workflow…',
  'Loading ultrasound pipeline…',
  'Calibrating overlay renderer…',
  'Ready.',
];

export function SplashScreen({ onComplete }: Props) {
  const [stageIndex, setStageIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const total   = STAGES.length;
    const delay   = 280; // ms per stage — snappy, not slow
    const stepPct = 100 / total;

    const interval = setInterval(() => {
      setStageIndex(prev => {
        const next = prev + 1;
        setProgress(Math.round(next * stepPct));
        if (next >= total) {
          clearInterval(interval);
          // Small pause on "Ready." before dismissing
          setTimeout(onComplete, 300);
        }
        return next;
      });
    }, delay);

    return () => clearInterval(interval);
  }, [onComplete]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.02 }}
      transition={{ duration: 0.6, ease: 'easeInOut' }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-surface-950"
    >
      {/* Background subtle gradient */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(20,184,166,0.06)_0%,transparent_70%)]" />

      {/* Content */}
      <div className="relative flex flex-col items-center gap-10 text-center px-8">
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="flex flex-col items-center gap-5"
        >
          {/* Icon */}
          <motion.div
            animate={{ boxShadow: ['0 0 0px rgba(20,184,166,0)', '0 0 40px rgba(20,184,166,0.2)', '0 0 0px rgba(20,184,166,0)'] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
            className="w-20 h-20 rounded-[22px] bg-surface-800 border border-teal-500/20 flex items-center justify-center"
          >
            <svg width="44" height="44" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M11 22h7M26 22h7M22 11v7M22 26v7" stroke="#14b8a6" strokeWidth="2.5" strokeLinecap="round"/>
              <circle cx="22" cy="22" r="6" stroke="#14b8a6" strokeWidth="2"/>
              <circle cx="22" cy="22" r="11" stroke="#14b8a6" strokeWidth="1" strokeOpacity="0.3" strokeDasharray="3 3"/>
            </svg>
          </motion.div>

          {/* Title */}
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-white">
              {APP_NAME}
            </h1>
            <p className="mt-2 text-sm text-white/40 font-light tracking-wide">
              {APP_TAGLINE}
            </p>
            <p className="mt-1.5 text-2xs text-white/20 font-medium uppercase tracking-widest">
              Version {APP_VERSION}
            </p>
          </div>
        </motion.div>

        {/* Loading section */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.4 }}
          className="flex flex-col items-center gap-4 w-72"
        >
          {/* Stage text */}
          <div className="h-5">
            <AnimatePresence mode="wait">
              <motion.p
                key={stageIndex}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25 }}
                className="text-xs text-white/35 font-medium"
              >
                {STAGES[Math.min(stageIndex, STAGES.length - 1)]}
              </motion.p>
            </AnimatePresence>
          </div>

          {/* Progress bar */}
          <div className="w-full h-px bg-surface-700 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-teal-500 rounded-full"
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
            />
          </div>
        </motion.div>

        {/* Tagline footer */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.2 }}
          transition={{ delay: 1, duration: 1 }}
          className="text-2xs text-white/20 uppercase tracking-[0.25em] absolute bottom-[-80px]"
        >
          Powered by FAST-Assist AI Platform
        </motion.p>
      </div>
    </motion.div>
  );
}

/**
 * FAST-Assist Studio — Overlay Renderer
 *
 * Draws transparent SVG/HTML overlays directly on top of the video.
 * Reads exclusively from InferenceResult — contains zero networking code.
 *
 * Overlays:
 *   • Corner bracket frame
 *   • Confidence arc indicator
 *   • Structure labels
 *   • Scan view badge
 *   • Free-fluid alert highlight
 *   • Quality warning strip
 */

import { motion, AnimatePresence } from 'framer-motion';
import type { InferenceResult } from '@/types';
import { clamp, formatConfidence } from '@/utils/smoothing';

interface Props {
  result: InferenceResult | null;
  isInferring: boolean;
}

export function OverlayRenderer({ result, isInferring }: Props) {
  const hasFreeFluid = result?.structures.some(s =>
    s.toLowerCase().includes('free fluid')
  ) ?? false;

  const quality = result?.quality.overall ?? 0;
  const isPoorQuality = quality > 0 && quality < 0.6;

  return (
    <div className="absolute inset-0 pointer-events-none select-none">
      {/* Corner bracket decorations */}
      <CornerBrackets active={!!result} />

      {/* Scan view badge — top left */}
      <AnimatePresence mode="wait">
        {result && (
          <motion.div
            key={result.scan_view}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.3 }}
            className="absolute top-4 left-4 flex items-center gap-2"
          >
            <div className="px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur-sm border border-teal-500/30">
              <span className="text-2xs font-semibold uppercase tracking-widest text-teal-300">
                {result.scan_view}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confidence arc — top right */}
      <AnimatePresence>
        {result && (
          <motion.div
            key="confidence"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="absolute top-4 right-4"
          >
            <ConfidenceArc value={result.confidence} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Structure labels — left edge */}
      <AnimatePresence mode="wait">
        {result && result.structures.length > 0 && (
          <motion.div
            key={result.structures.join(',')}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, staggerChildren: 0.05 }}
            className="absolute left-4 top-1/2 -translate-y-1/2 flex flex-col gap-1.5"
          >
            {result.structures.map((structure, i) => (
              <motion.div
                key={structure}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.06, duration: 0.3 }}
                className={`flex items-center gap-2 px-2.5 py-1 rounded-md ${
                  structure.toLowerCase().includes('free fluid')
                    ? 'bg-red-500/20 border border-red-400/40'
                    : 'bg-black/50 border border-white/10'
                } backdrop-blur-xs`}
              >
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  structure.toLowerCase().includes('free fluid')
                    ? 'bg-red-400'
                    : 'bg-teal-400'
                }`} />
                <span className={`text-2xs font-medium ${
                  structure.toLowerCase().includes('free fluid')
                    ? 'text-red-200'
                    : 'text-white/80'
                }`}>
                  {structure}
                </span>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Guidance strip — bottom */}
      <AnimatePresence mode="wait">
        {result?.guidance && (
          <motion.div
            key={result.guidance}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.35 }}
            className="absolute bottom-4 left-4 right-4"
          >
            <div className={`px-4 py-2.5 rounded-xl backdrop-blur-sm border ${
              hasFreeFluid
                ? 'bg-red-900/50 border-red-400/30'
                : isPoorQuality
                ? 'bg-amber-900/40 border-amber-400/30'
                : 'bg-black/60 border-white/10'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  hasFreeFluid ? 'bg-red-400 animate-pulse' :
                  isPoorQuality ? 'bg-amber-400' :
                  'bg-teal-400'
                }`} />
                <span className={`text-xs font-medium ${
                  hasFreeFluid ? 'text-red-200' :
                  isPoorQuality ? 'text-amber-200' :
                  'text-white/85'
                }`}>
                  {result.guidance}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Free fluid alert — prominent banner */}
      <AnimatePresence>
        {hasFreeFluid && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
          >
            <div className="px-4 py-2 rounded-xl bg-red-900/70 border border-red-400/50 backdrop-blur-sm">
              <span className="text-xs font-bold uppercase tracking-widest text-red-300 animate-pulse">
                ⚠ Free Fluid Detected
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Inference indicator — pulsing ring during active inference */}
      <AnimatePresence>
        {isInferring && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute top-3 right-3"
          >
            <div className="w-2 h-2 rounded-full bg-teal-400 animate-ping" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Poor quality warning */}
      <AnimatePresence>
        {isPoorQuality && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute top-4 left-1/2 -translate-x-1/2"
          >
            <div className="px-3 py-1 rounded-lg bg-amber-900/60 border border-amber-400/30 backdrop-blur-sm">
              <span className="text-2xs font-medium text-amber-300 uppercase tracking-wider">
                Poor Image Quality
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CornerBrackets({ active }: { active: boolean }) {
  const color = active ? 'rgba(20,184,166,0.5)' : 'rgba(255,255,255,0.12)';
  const size  = 20;
  const thickness = 2;
  const offset = 12;

  const corners = [
    { top: offset, left: offset,   rotate: 0   },
    { top: offset, right: offset,  rotate: 90  },
    { bottom: offset, right: offset, rotate: 180 },
    { bottom: offset, left: offset,  rotate: 270 },
  ];

  return (
    <>
      {corners.map((pos, i) => (
        <motion.div
          key={i}
          animate={{ opacity: active ? 1 : 0.3 }}
          transition={{ duration: 0.5 }}
          className="absolute"
          style={{
            ...pos,
            width: size,
            height: size,
            transform: `rotate(${pos.rotate}deg)`,
          }}
        >
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none">
            <path
              d={`M0 ${size} L0 0 L${size} 0`}
              stroke={color}
              strokeWidth={thickness}
              strokeLinecap="round"
            />
          </svg>
        </motion.div>
      ))}
    </>
  );
}

function ConfidenceArc({ value }: { value: number }) {
  const pct    = clamp(value, 0, 1);
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const strokeDash    = circumference * pct;
  const isHigh   = pct >= 0.85;
  const isMedium = pct >= 0.65;
  const color = isHigh ? '#14b8a6' : isMedium ? '#fbbf24' : '#ef4444';

  return (
    <div className="relative w-16 h-16 flex items-center justify-center">
      <svg width="64" height="64" viewBox="0 0 64 64" style={{ transform: 'rotate(-90deg)' }}>
        {/* Track */}
        <circle cx="32" cy="32" r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
        {/* Progress */}
        <motion.circle
          cx="32" cy="32" r={radius}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference - strokeDash }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          key={Math.round(pct * 100)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-xs font-bold tabular-nums"
          style={{ color }}
        >
          {formatConfidence(value)}
        </motion.span>
        <span className="text-2xs text-white/30 mt-0.5">AI</span>
      </div>
    </div>
  );
}

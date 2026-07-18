/**
 * FAST-Assist Studio — Animated Confidence Bar
 */

import { motion } from 'framer-motion';
import { clamp, formatConfidence } from '@/utils/smoothing';

interface Props {
  value: number; // 0–1
  label?: string;
  size?: 'sm' | 'md';
}

function getColor(value: number): string {
  if (value >= 0.85) return 'bg-teal-500';
  if (value >= 0.65) return 'bg-amber-400';
  return 'bg-red-500';
}

function getGlow(value: number): string {
  if (value >= 0.85) return 'shadow-glow-sm';
  return '';
}

export function ConfidenceBar({ value, label, size = 'md' }: Props) {
  const pct = clamp(value, 0, 1) * 100;
  const barH = size === 'sm' ? 'h-1' : 'h-1.5';

  return (
    <div className="w-full">
      {label && (
        <div className="flex items-center justify-between mb-1">
          <span className="label">{label}</span>
          <motion.span
            key={Math.round(pct)}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs font-semibold text-white tabular-nums"
          >
            {formatConfidence(value)}
          </motion.span>
        </div>
      )}
      <div className={`w-full ${barH} rounded-full bg-surface-600 overflow-hidden`}>
        <motion.div
          className={`h-full rounded-full ${getColor(value)} ${getGlow(value)}`}
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}

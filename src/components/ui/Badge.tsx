/**
 * FAST-Assist Studio — Badge Component
 */

import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  variant?: 'teal' | 'amber' | 'red' | 'neutral';
}

const VARIANTS = {
  teal:    'bg-teal-500/15 text-teal-300 border-teal-500/20',
  amber:   'bg-amber-400/15 text-amber-300 border-amber-400/20',
  red:     'bg-red-500/15 text-red-300 border-red-500/20',
  neutral: 'bg-white/8 text-white/60 border-white/10',
};

export function Badge({ children, variant = 'teal' }: Props) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-medium border ${VARIANTS[variant]}`}>
      {children}
    </span>
  );
}

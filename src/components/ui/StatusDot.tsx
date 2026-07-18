/**
 * FAST-Assist Studio — Status Indicator Dot
 */

import type { ConnectionStatus } from '@/types';

interface Props {
  status: ConnectionStatus;
  size?: 'sm' | 'md';
}

const CONFIG: Record<ConnectionStatus, { color: string; label: string; pulse: boolean }> = {
  connected:  { color: 'bg-teal-400',   label: 'Connected',  pulse: true },
  mock:       { color: 'bg-amber-400',  label: 'Mock Mode',  pulse: true },
  connecting: { color: 'bg-white/40',   label: 'Connecting', pulse: true },
  error:      { color: 'bg-red-500',    label: 'Error',      pulse: false },
};

export function StatusDot({ status, size = 'md' }: Props) {
  const cfg   = CONFIG[status];
  const dotSz = size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2';
  const glow  =
    status === 'connected'  ? 'shadow-[0_0_6px_rgba(20,184,166,0.8)]' :
    status === 'mock'       ? 'shadow-[0_0_6px_rgba(251,191,36,0.8)]' : '';

  return (
    <div className="flex items-center gap-1.5">
      <span className={`relative flex ${dotSz}`}>
        {cfg.pulse && (
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${cfg.color} opacity-40`} />
        )}
        <span className={`relative inline-flex rounded-full ${dotSz} ${cfg.color} ${glow}`} />
      </span>
      <span className="text-2xs font-medium uppercase tracking-widest text-white/50">
        {cfg.label}
      </span>
    </div>
  );
}

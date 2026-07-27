/**
 * FAST-Assist Studio — Bottom Status Bar
 */

import { useClock } from '@/hooks/useClock';
import { useAppStore } from '@/state/store';
import { APP_VERSION } from '@/config';
import { formatLatency } from '@/utils/smoothing';
import { STEP_LABELS, isAcquiringStep, isAwaitingStep } from '@/exam/sessionMeta';

export function StatusBar() {
  const time = useClock();
  const { connectionStatus, isMockMode, backendType, metrics, examStep } = useAppStore();

  const backendLabel = isMockMode ? 'Mock Backend' : `${backendType.toUpperCase()} Backend`;

  const showExamStep = examStep !== 'idle' && examStep !== 'ready';
  const examStepLabel = STEP_LABELS[examStep];
  const examColor: 'teal' | 'amber' | 'neutral' =
    isAwaitingStep(examStep) ? 'amber' :
    isAcquiringStep(examStep) ? 'teal' :
    examStep === 'complete' ? 'teal' : 'neutral';

  return (
    <footer className="flex items-center justify-between px-5 h-8 bg-surface-950 border-t border-white/5 text-2xs text-white/25 font-medium select-none">
      <div className="flex items-center gap-4">
        <StatusPill
          color={
            connectionStatus === 'connected'  ? 'teal' :
            connectionStatus === 'mock'       ? 'amber' :
            connectionStatus === 'connecting' ? 'neutral' : 'red'
          }
          label={backendLabel}
        />
        {showExamStep && (
          <>
            <span className="hidden sm:block">│</span>
            <StatusPill color={examColor} label={examStepLabel} />
          </>
        )}
        <span className="hidden md:block">│</span>
        <span className="hidden md:block">
          {connectionStatus === 'connected'  ? 'Connected' :
           connectionStatus === 'mock'       ? 'Mock Mode' :
           connectionStatus === 'connecting' ? 'Connecting…' : 'Error'}
        </span>
      </div>

      <div className="flex items-center gap-4">
        {metrics.inferenceLatency > 0 && isAcquiringStep(examStep) && (
          <>
            <span className="hidden sm:block tabular-nums">{formatLatency(metrics.inferenceLatency)}</span>
            <span className="hidden sm:block">│</span>
          </>
        )}
        <span className="tabular-nums font-mono">{time}</span>
        <span className="hidden lg:block">│</span>
        <span className="hidden lg:block">FAST-Assist Studio v{APP_VERSION}</span>
      </div>
    </footer>
  );
}

function StatusPill({ color, label }: { color: 'teal' | 'amber' | 'neutral' | 'red'; label: string }) {
  const dot: Record<string, string> = {
    teal:    'bg-teal-400',
    amber:   'bg-amber-400',
    neutral: 'bg-white/30',
    red:     'bg-red-400',
  };
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-1.5 h-1.5 rounded-full ${dot[color]}`} />
      <span className="uppercase tracking-wider">{label}</span>
    </div>
  );
}

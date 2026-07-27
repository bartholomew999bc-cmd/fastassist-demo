/**
 * FAST-Assist Studio — Right Information Panel
 *
 * Displays structured AI metadata and examination workflow state.
 * RC1 additions: ExamSessionCard (progress + start/reset) and SourceSelector.
 */

import { motion, AnimatePresence } from 'framer-motion';
import {
  RiEyeLine,
  RiShieldCheckLine,
  RiImageLine,
  RiListCheck,
  RiNavigationLine,
  RiServerLine,
  RiVideoLine,
  RiCheckLine,
  RiLoader4Line,
  RiPlayLine,
  RiRefreshLine,
} from 'react-icons/ri';
import { useAppStore } from '@/state/store';
import { ConfidenceBar } from '@/components/ui/ConfidenceBar';
import { Badge } from '@/components/ui/Badge';
import { StatusDot } from '@/components/ui/StatusDot';
import { SourceSelector } from '@/components/ui/SourceSelector';
import { formatLatency } from '@/utils/smoothing';
import {
  EXAM_WINDOWS,
  STEP_LABELS,
  windowIndexForStep,
  isAwaitingStep,
  isAcquiringStep,
} from '@/exam/sessionMeta';
import type { InferenceState } from '@/hooks/useInference';
import type { ExamSessionStep } from '@/types';

interface Props {
  inference: InferenceState;
}

export function InfoPanel({ inference }: Props) {
  // Live inference data via prop (avoids Zustand subscription latency)
  const currentResult = inference.result;
  const isMockMode    = inference.isMock;

  // Examination session state
  const examStep     = useAppStore(s => s.examStep);
  const confirmedViews = useAppStore(s => s.confirmedViews);
  const startExam    = useAppStore(s => s.startExam);
  const resetExam    = useAppStore(s => s.resetExam);

  // Static / slowly-changing config from the store
  const connectionStatus  = useAppStore(s => s.connectionStatus);
  const inferenceInterval = useAppStore(s => s.inferenceInterval);

  const isIdle     = examStep === 'idle' || examStep === 'ready';
  const isComplete = examStep === 'complete';
  const isActive   = isAcquiringStep(examStep) || isAwaitingStep(examStep);

  return (
    <aside className="flex flex-col gap-3 h-full overflow-y-auto pr-0.5">

      {/* ── Examination Session ─────────────────────────────────────────────── */}
      <PanelCard icon={<RiPlayLine size={13} />} title="Examination">
        <ExamSessionCard
          examStep={examStep}
          confirmedCount={confirmedViews.length}
          isIdle={isIdle}
          isComplete={isComplete}
          onStart={startExam}
          onReset={resetExam}
        />
      </PanelCard>

      {/* ── AI data — only shown when exam is active ────────────────────────── */}
      <AnimatePresence>
        {isActive && (
          <motion.div
            key="ai-panels"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col gap-3"
          >
            {/* Current Scan */}
            <PanelCard icon={<RiEyeLine size={13} />} title="Current Window">
              <InfoRow label="View">
                <AnimatePresence mode="wait">
                  <motion.span
                    key={currentResult?.scan_view ?? 'none'}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    className="value text-teal-300"
                  >
                    {currentResult?.scan_view ?? '—'}
                  </motion.span>
                </AnimatePresence>
              </InfoRow>
              <InfoRow label="Status">
                <span className={`text-xs font-medium ${
                  isAwaitingStep(examStep)
                    ? 'text-teal-400'
                    : 'text-white/45'
                }`}>
                  {STEP_LABELS[examStep]}
                </span>
              </InfoRow>
            </PanelCard>

            {/* Confidence */}
            <PanelCard icon={<RiShieldCheckLine size={13} />} title="AI Confidence">
              <div className="space-y-3 pt-1">
                <ConfidenceBar
                  value={currentResult?.confidence ?? 0}
                  label="Overall"
                />
                {isAwaitingStep(examStep) && (
                  <div className="flex items-center gap-2 pt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse flex-shrink-0" />
                    <span className="text-2xs font-medium text-teal-400 uppercase tracking-wider">
                      Awaiting Confirmation
                    </span>
                  </div>
                )}
              </div>
            </PanelCard>

            {/* Image Quality */}
            <PanelCard icon={<RiImageLine size={13} />} title="Image Quality">
              {currentResult ? (
                <div className="space-y-2.5 pt-0.5">
                  <ConfidenceBar
                    value={currentResult.quality.overall}
                    label="Score"
                    size="sm"
                  />
                  <QualityRow label="Motion" value={currentResult.quality.motion} />
                  <QualityRow label="Gain"   value={currentResult.quality.gain} />
                  <QualityRow label="Depth"  value={currentResult.quality.depth} />
                </div>
              ) : (
                <EmptyState />
              )}
            </PanelCard>

            {/* Detected Structures */}
            <PanelCard icon={<RiListCheck size={13} />} title="Structures">
              <AnimatePresence mode="wait">
                {currentResult?.structures && currentResult.structures.length > 0 ? (
                  <motion.div
                    key={currentResult.structures.join(',')}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-wrap gap-1.5 pt-1"
                  >
                    {currentResult.structures.map((s) => (
                      <Badge
                        key={s}
                        variant={s.toLowerCase().includes('free fluid') ? 'red' : 'teal'}
                      >
                        {s}
                      </Badge>
                    ))}
                  </motion.div>
                ) : (
                  <EmptyState />
                )}
              </AnimatePresence>
            </PanelCard>

            {/* AI Guidance */}
            <PanelCard icon={<RiNavigationLine size={13} />} title="Guidance">
              <AnimatePresence mode="wait">
                {currentResult?.guidance ? (
                  <motion.p
                    key={currentResult.guidance}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="text-xs text-white/70 leading-relaxed pt-0.5"
                  >
                    {currentResult.guidance}
                  </motion.p>
                ) : (
                  <EmptyState />
                )}
              </AnimatePresence>
            </PanelCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── System / Backend ────────────────────────────────────────────────── */}
      <PanelCard icon={<RiServerLine size={13} />} title="Backend">
        <div className="space-y-2 pt-0.5">
          <StatusDot status={connectionStatus} size="sm" />
          {isMockMode && (
            <p className="text-2xs text-amber-400/80">
              Mock mode — AI endpoint not reachable
            </p>
          )}
          {inference.latencyMs > 0 && (
            <InfoRow label="Latency">
              <span className="value tabular-nums text-teal-300">
                {formatLatency(inference.latencyMs)}
              </span>
            </InfoRow>
          )}
          {isActive && (
            <InfoRow label="Interval">
              <span className="value tabular-nums">{inferenceInterval} ms</span>
            </InfoRow>
          )}
        </div>
      </PanelCard>

      {/* ── Video Source ────────────────────────────────────────────────────── */}
      <PanelCard icon={<RiVideoLine size={13} />} title="Video Source">
        <div className="pt-0.5">
          <SourceSelector />
        </div>
      </PanelCard>

    </aside>
  );
}

// ─── Examination Session Card ─────────────────────────────────────────────────

interface ExamSessionCardProps {
  examStep:       ExamSessionStep;
  confirmedCount: number;
  isIdle:         boolean;
  isComplete:     boolean;
  onStart:        () => void;
  onReset:        () => void;
}

function ExamSessionCard({
  examStep,
  confirmedCount,
  isIdle,
  isComplete,
  onStart,
  onReset,
}: ExamSessionCardProps) {
  const activeWindowIdx = windowIndexForStep(examStep);

  return (
    <div className="space-y-3 pt-0.5">
      {/* 4-window progress track */}
      <div className="flex items-center gap-1.5">
        {EXAM_WINDOWS.map((w, i) => {
          const isConfirmed = i < confirmedCount;
          const isCurrentActive = i === activeWindowIdx;
          const isAwaiting = w.awaitStep === examStep;

          return (
            <div key={w.shortLabel} className="flex items-center gap-1.5 flex-1">
              {/* Step dot */}
              <div className="flex flex-col items-center gap-0.5 flex-1">
                <motion.div
                  animate={isCurrentActive && !isAwaiting ? {
                    boxShadow: [
                      '0 0 0px rgba(20,184,166,0)',
                      '0 0 8px rgba(20,184,166,0.5)',
                      '0 0 0px rgba(20,184,166,0)',
                    ],
                  } : {}}
                  transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                  className={[
                    'w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 border',
                    isConfirmed
                      ? 'bg-teal-500/30 border-teal-500/60'
                      : isAwaiting
                      ? 'bg-teal-500/20 border-teal-500/50'
                      : isCurrentActive
                      ? 'bg-teal-500/10 border-teal-500/30'
                      : 'bg-surface-700/60 border-white/8',
                  ].join(' ')}
                >
                  {isConfirmed ? (
                    <RiCheckLine size={10} className="text-teal-400" />
                  ) : isAwaiting ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
                  ) : isCurrentActive ? (
                    <RiLoader4Line size={10} className="text-teal-400/70 animate-spin" />
                  ) : (
                    <span className="w-1 h-1 rounded-full bg-white/15" />
                  )}
                </motion.div>
                <span className={`text-2xs uppercase tracking-wider font-medium ${
                  isConfirmed || isAwaiting || isCurrentActive
                    ? 'text-white/50'
                    : 'text-white/18'
                }`}>
                  {w.shortLabel}
                </span>
              </div>

              {/* Connector line between dots */}
              {i < EXAM_WINDOWS.length - 1 && (
                <div className={`h-px flex-1 mb-3 ${
                  i < confirmedCount ? 'bg-teal-500/40' : 'bg-white/8'
                }`} />
              )}
            </div>
          );
        })}
      </div>

      {/* State label */}
      <AnimatePresence mode="wait">
        <motion.div
          key={examStep}
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="text-center"
        >
          {isComplete ? (
            <p className="text-xs font-semibold text-teal-400">
              FAST Examination Complete
            </p>
          ) : isIdle ? (
            <p className="text-2xs text-white/30">
              Ready to begin FAST examination
            </p>
          ) : (
            <p className="text-xs text-white/55 font-medium">
              {STEP_LABELS[examStep]}
            </p>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Action button */}
      {isIdle && (
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={onStart}
          className="w-full py-2 rounded-xl bg-teal-500/15 border border-teal-500/30 text-teal-300 text-xs font-semibold hover:bg-teal-500/25 hover:border-teal-500/50 transition-all"
        >
          Begin FAST Examination
        </motion.button>
      )}

      {isComplete && (
        <motion.button
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          whileTap={{ scale: 0.97 }}
          onClick={onReset}
          className="w-full py-2 rounded-xl border border-white/10 text-white/45 text-xs font-medium hover:bg-white/5 hover:text-white/70 transition-all flex items-center justify-center gap-2"
        >
          <RiRefreshLine size={13} />
          New Examination
        </motion.button>
      )}
    </div>
  );
}

// ─── Panel sub-components ─────────────────────────────────────────────────────

function PanelCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      layout
      className="card-sm px-3.5 py-3 space-y-2"
    >
      <div className="flex items-center gap-2 text-white/35">
        {icon}
        <span className="label text-white/35">{title}</span>
      </div>
      {children}
    </motion.div>
  );
}

function InfoRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="label">{label}</span>
      {children}
    </div>
  );
}

function QualityRow({ label, value }: { label: string; value: string }) {
  const isGood = ['Stable', 'Adequate', 'Optimal'].includes(value);
  const isBad  = ['Motion artifact', 'Too high', 'Too low', 'Too shallow', 'Too deep'].includes(value);

  return (
    <div className="flex items-center justify-between">
      <span className="label">{label}</span>
      <AnimatePresence mode="wait">
        <motion.span
          key={value}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={`text-2xs font-medium ${
            isGood ? 'text-teal-400' : isBad ? 'text-amber-400' : 'text-white/60'
          }`}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

function EmptyState() {
  return (
    <p className="text-2xs text-white/25 italic pt-0.5">Awaiting data…</p>
  );
}

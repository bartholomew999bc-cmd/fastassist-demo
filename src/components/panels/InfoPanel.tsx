/**
 * FAST-Assist Studio — Right Information Panel
 *
 * Displays structured metadata from the AI inference result.
 * Every value animates on change. No networking code here.
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
  RiTimeLine,
  RiHashtag,
} from 'react-icons/ri';
import { useAppStore } from '@/state/store';
import { ConfidenceBar } from '@/components/ui/ConfidenceBar';
import { Badge } from '@/components/ui/Badge';
import { StatusDot } from '@/components/ui/StatusDot';
import { formatLatency } from '@/utils/smoothing';
import type { InferenceState } from '@/hooks/useInference';

interface Props {
  inference: InferenceState;
}

export function InfoPanel({ inference }: Props) {
  // Live inference data comes directly via prop (avoids Zustand subscription latency)
  const currentResult = inference.result;
  const isMockMode    = inference.isMock;

  // Static / slowly-changing config from the store
  const connectionStatus  = useAppStore(s => s.connectionStatus);
  const inferenceInterval = useAppStore(s => s.inferenceInterval);
  const videoPath         = useAppStore(s => s.videoPath);

  return (
    <aside className="flex flex-col gap-3 h-full overflow-y-auto pr-0.5">
      {/* Current Scan */}
      <PanelCard icon={<RiEyeLine size={13} />} title="Current Scan">
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
      </PanelCard>

      {/* Confidence */}
      <PanelCard icon={<RiShieldCheckLine size={13} />} title="AI Confidence">
        <div className="space-y-3 pt-1">
          <ConfidenceBar
            value={currentResult?.confidence ?? 0}
            label="Overall"
          />
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

      {/* System Status */}
      <PanelCard icon={<RiServerLine size={13} />} title="Backend Status">
        <div className="space-y-2 pt-0.5">
          <StatusDot status={connectionStatus} size="sm" />
          {isMockMode && (
            <p className="text-2xs text-amber-400/80">
              Running in demo mode — AI endpoint not reachable
            </p>
          )}
          {inference.latencyMs > 0 && (
            <InfoRow label="Latency">
              <span className="value tabular-nums text-teal-300">
                {formatLatency(inference.latencyMs)}
              </span>
            </InfoRow>
          )}
        </div>
      </PanelCard>

      {/* Technical Details */}
      <PanelCard icon={<RiVideoLine size={13} />} title="Video Source">
        <InfoRow label="File">
          <span className="value text-white/60 font-mono text-2xs truncate max-w-[120px]">
            {videoPath.split('/').pop()}
          </span>
        </InfoRow>
      </PanelCard>

      <PanelCard icon={<RiTimeLine size={13} />} title="Interval">
        <InfoRow label="Inference">
          <span className="value tabular-nums">{inferenceInterval} ms</span>
        </InfoRow>
      </PanelCard>

      <PanelCard icon={<RiHashtag size={13} />} title="Frame">
        <InfoRow label="Number">
          <motion.span
            key={inference.frameNumber}
            initial={{ opacity: 0.4 }}
            animate={{ opacity: 1 }}
            className="value tabular-nums font-mono"
          >
            {inference.frameNumber}
          </motion.span>
        </InfoRow>
      </PanelCard>
    </aside>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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

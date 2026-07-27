/**
 * FAST-Assist Studio — Inference Inspector Panel (RC3)
 *
 * Developer-facing collapsible bottom drawer.
 * Reads from inferenceLog (session log) and displays:
 *   Provider · Performance · Parsed Metadata · Raw Response · Reasoning · Diagnostics · Session Log
 *
 * This panel is NOT clinical — it is for developer / debugging purposes only.
 * It has zero influence on the examination workflow.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RiCodeBoxLine,
  RiCloseLine,
  RiTimeLine,
  RiCpuLine,
  RiCheckboxCircleLine,
  RiAlertLine,
  RiDeleteBinLine,
  RiArrowUpSLine,
} from 'react-icons/ri';
import { useAppStore }     from '@/state/store';
import { useInferenceLog } from '@/state/inferenceLog';
import type { FullInferenceResult } from '@/types/inference';

// ─── Drawer shell ─────────────────────────────────────────────────────────────

export function InspectorPanel() {
  const inspectorOpen   = useAppStore(s => s.inspectorOpen);
  const setInspectorOpen = useAppStore(s => s.setInspectorOpen);

  return (
    <AnimatePresence>
      {inspectorOpen && (
        <motion.div
          key="inspector"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 340, opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          className="relative z-20 flex-shrink-0 bg-surface-900 border-t border-white/8 overflow-hidden"
        >
          <InspectorContent onClose={() => setInspectorOpen(false)} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Content ──────────────────────────────────────────────────────────────────

function InspectorContent({ onClose }: { onClose: () => void }) {
  const entries    = useInferenceLog(s => s.entries);
  const clearLog   = useInferenceLog(s => s.clear);
  const connection = useAppStore(s => s.connectionStatus);
  const provider   = useAppStore(s => s.selectedProvider);
  const metrics    = useAppStore(s => s.metrics);

  const last       = entries.length > 0 ? entries[entries.length - 1].result : null;
  const [tab, setTab] = useState<'current' | 'log'>('current');

  return (
    <div className="flex flex-col h-full text-xs font-mono">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-white/5 flex-shrink-0">
        <RiCodeBoxLine size={13} className="text-teal-400" />
        <span className="text-white/60 font-sans font-medium tracking-wide text-[11px] uppercase">
          Inference Inspector
        </span>
        <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] bg-teal-500/10 text-teal-400 border border-teal-500/20">
          DEV
        </span>

        {/* Tabs */}
        <div className="flex ml-4 gap-1">
          {(['current', 'log'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-2.5 py-0.5 rounded text-[11px] transition-colors ${
                tab === t
                  ? 'bg-white/10 text-white'
                  : 'text-white/30 hover:text-white/60'
              }`}
            >
              {t === 'current' ? 'Current Result' : `Session Log (${entries.length})`}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {entries.length > 0 && (
          <button
            onClick={clearLog}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-white/30 hover:text-red-400 transition-colors"
          >
            <RiDeleteBinLine size={11} />
            Clear
          </button>
        )}

        <button
          onClick={onClose}
          className="flex items-center justify-center w-6 h-6 rounded text-white/30 hover:text-white hover:bg-white/8 transition-colors"
        >
          <RiCloseLine size={14} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden">
        {tab === 'current' ? (
          <CurrentTab result={last} connection={connection} provider={provider} metrics={metrics} />
        ) : (
          <LogTab entries={entries} />
        )}
      </div>
    </div>
  );
}

// ─── Current result tab ───────────────────────────────────────────────────────

interface CurrentTabProps {
  result:     FullInferenceResult | null;
  connection: string;
  provider:   string;
  metrics:    { inferenceLatency: number; fps: number; frameNumber: number };
}

function CurrentTab({ result, connection, provider, metrics }: CurrentTabProps) {
  const [showRaw, setShowRaw] = useState(false);

  if (!result) {
    return (
      <div className="flex items-center justify-center h-full text-white/20">
        No hosted inference results yet. Select "Hosted AI" provider and start an exam.
      </div>
    );
  }

  const { metadata, telemetry, rawResponse, reasoning, diagnostics } = result;

  return (
    <div className="flex gap-0 h-full overflow-hidden">
      {/* Left col: metadata + telemetry */}
      <div className="w-[340px] flex-shrink-0 overflow-y-auto p-3 space-y-3 border-r border-white/5">

        {/* Provider */}
        <Section icon={<RiCpuLine size={11} />} title="Provider">
          <KV k="active"     v={provider} />
          <KV k="connection" v={connection} highlight={connection === 'connected'} />
          <KV k="model"      v={telemetry.model ?? 'qwen2.5-vl-7b'} />
        </Section>

        {/* Performance */}
        <Section icon={<RiTimeLine size={11} />} title="Performance">
          <KV k="wall time"  v={`${telemetry.wallTimeMs} ms`} />
          <KV k="smoothed"   v={`${metrics.inferenceLatency} ms`} />
          <KV k="fps"        v={String(metrics.fps)} />
          <KV k="frame #"    v={String(metrics.frameNumber)} />
          {telemetry.promptTokens  != null && <KV k="prompt tok"  v={String(telemetry.promptTokens)} />}
          {telemetry.completTokens != null && <KV k="output tok"  v={String(telemetry.completTokens)} />}
        </Section>

        {/* Parsed metadata */}
        <Section icon={<RiCheckboxCircleLine size={11} />} title="Parsed Metadata">
          <KV k="scan_view"   v={metadata.scan_view} />
          <KV k="confidence"  v={metadata.confidence.toFixed(3)} highlight={metadata.confidence >= 0.8} />
          <KV k="structures"  v={metadata.structures.join(', ') || '—'} />
          <KV k="quality"     v={metadata.quality.overall.toFixed(2)} />
          <KV k="motion"      v={metadata.quality.motion} />
          <KV k="gain"        v={metadata.quality.gain} />
          <KV k="depth"       v={metadata.quality.depth} />
          <KV k="guidance"    v={metadata.guidance} wrap />
        </Section>

        {/* Diagnostics */}
        {diagnostics && (
          <Section icon={<RiAlertLine size={11} />} title="Diagnostics" warn>
            <p className="text-yellow-400/80 text-[11px] leading-relaxed">{diagnostics}</p>
          </Section>
        )}
      </div>

      {/* Right col: raw response + reasoning */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">

        {/* Reasoning */}
        {reasoning && (
          <Section title="Reasoning (Chain-of-Thought)">
            <pre className="whitespace-pre-wrap text-white/50 text-[11px] leading-relaxed">{reasoning}</pre>
          </Section>
        )}

        {/* Raw response */}
        <Section
          title="Raw Model Response"
          action={
            <button
              onClick={() => setShowRaw(v => !v)}
              className="flex items-center gap-1 text-white/30 hover:text-white/60 transition-colors"
            >
              <RiArrowUpSLine
                size={12}
                className={`transition-transform ${showRaw ? 'rotate-0' : 'rotate-180'}`}
              />
              {showRaw ? 'collapse' : 'expand'}
            </button>
          }
        >
          {showRaw && (
            <pre className="whitespace-pre-wrap text-green-400/70 text-[11px] leading-relaxed overflow-x-auto">
              {rawResponse ?? '(empty)'}
            </pre>
          )}
          {!showRaw && (
            <p className="text-white/20 text-[11px]">
              {rawResponse ? `${rawResponse.slice(0, 120)}…` : '(empty)'}
            </p>
          )}
        </Section>
      </div>
    </div>
  );
}

// ─── Session log tab ──────────────────────────────────────────────────────────

function LogTab({ entries }: { entries: ReturnType<typeof useInferenceLog.getState>['entries'] }) {
  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-white/20">
        No entries yet.
      </div>
    );
  }

  const reversed = [...entries].reverse();

  return (
    <div className="h-full overflow-y-auto">
      <table className="w-full text-[11px]">
        <thead className="sticky top-0 bg-surface-900 border-b border-white/5">
          <tr className="text-white/30">
            <Th>Frame</Th>
            <Th>View</Th>
            <Th>Conf</Th>
            <Th>Quality</Th>
            <Th>Wall ms</Th>
            <Th>Tokens</Th>
            <Th className="text-left pl-3">Guidance</Th>
          </tr>
        </thead>
        <tbody>
          {reversed.map((entry, i) => {
            const m = entry.result.metadata;
            const t = entry.result.telemetry;
            return (
              <tr
                key={entry.id}
                className={`border-b border-white/3 ${i === 0 ? 'bg-teal-500/5' : 'hover:bg-white/3'} transition-colors`}
              >
                <Td>{entry.frameNumber}</Td>
                <Td>{m.scan_view}</Td>
                <Td className={m.confidence >= 0.8 ? 'text-teal-400' : 'text-white/60'}>
                  {m.confidence.toFixed(2)}
                </Td>
                <Td className={m.quality.overall >= 0.75 ? 'text-teal-400' : 'text-white/40'}>
                  {m.quality.overall.toFixed(2)}
                </Td>
                <Td>{t.wallTimeMs}</Td>
                <Td>{t.completTokens ?? '—'}</Td>
                <td className="px-3 py-1.5 text-white/40 max-w-xs truncate">{m.guidance}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Small UI atoms ───────────────────────────────────────────────────────────

function Section({
  title, icon, action, warn = false, children,
}: {
  title: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  warn?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        {icon && <span className={warn ? 'text-yellow-400' : 'text-white/30'}>{icon}</span>}
        <span className={`text-[10px] uppercase tracking-widest font-sans ${warn ? 'text-yellow-400/60' : 'text-white/25'}`}>
          {title}
        </span>
        {action && <span className="ml-auto">{action}</span>}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function KV({
  k, v, highlight = false, wrap = false,
}: {
  k: string; v: string; highlight?: boolean; wrap?: boolean;
}) {
  return (
    <div className={`flex gap-2 ${wrap ? 'items-start' : 'items-center'}`}>
      <span className="text-white/25 w-[80px] shrink-0">{k}</span>
      <span className={`${highlight ? 'text-teal-400' : 'text-white/70'} ${wrap ? 'break-words' : 'truncate'}`}>
        {v}
      </span>
    </div>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`px-3 py-1.5 text-right font-normal ${className}`}>{children}</th>
  );
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={`px-3 py-1.5 text-right tabular-nums text-white/50 ${className}`}>{children}</td>
  );
}

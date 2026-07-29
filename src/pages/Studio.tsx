/**
 * FAST-Assist Studio — Main Studio Page
 *
 * Layout:
 *   TopBar (fixed height)
 *   ┌─────────────────────────────┬──────────────┐
 *   │                             │              │
 *   │   SourceRenderer + Overlay  │  Info Panel  │
 *   │          (75%)              │    (25%)     │
 *   └─────────────────────────────┴──────────────┘
 *   StatusBar (fixed height)
 *
 * Wires the single ingest pipeline → inference hook → exam state → UI.
 */

import { motion } from 'framer-motion';
import { TopBar }            from '@/components/layout/TopBar';
import { StatusBar }         from '@/components/layout/StatusBar';
import { SourceRenderer }    from '@/components/video/SourceRenderer';
import { OverlayRenderer }   from '@/components/overlay/OverlayRenderer';
import { InfoPanel }         from '@/components/panels/InfoPanel';
import { InspectorPanel }    from '@/components/panels/InspectorPanel';
import { useInference }      from '@/hooks/useInference';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useAppStore } from '@/state/store';

export function Studio() {
  // Single inference loop — consumes frames from VideoIngestManager
  const inference = useInference();
  useKeyboardShortcuts();

  // Examination workflow state
  const examPhase    = useAppStore(s => s.examPhase);
  const examStep     = useAppStore(s => s.examStep);
  const frozenResult = useAppStore(s => s.frozenResult);
  const isInferring  = useAppStore(s => s.isInferring);
  const confirmView  = useAppStore(s => s.confirmView);
  const reacquire    = useAppStore(s => s.reacquire);

  // When the workflow is frozen, keep the frozen result on screen.
  // When idle / ready / complete, show nothing (no spurious overlays).
  // Otherwise show the live inference result.
  const isInactiveStep = examStep === 'idle' || examStep === 'ready' || examStep === 'complete';
  const displayResult = examPhase === 'awaiting_confirmation'
    ? frozenResult
    : isInactiveStep
    ? null
    : inference.result;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
      className="flex flex-col h-screen bg-surface-950 overflow-hidden"
    >
      {/* Top Navigation */}
      <TopBar />

      {/* Main workspace */}
      <main className="flex flex-1 gap-0 overflow-hidden min-h-0">

        {/* ── Video area (75%) ── */}
        <div className="flex-1 relative bg-black overflow-hidden">
          {/* Subtle vignette on video edges */}
          <div
            className="absolute inset-0 pointer-events-none z-10"
            style={{ boxShadow: 'inset 0 0 60px rgba(0,0,0,0.5)' }}
          />

          {/* Active video source (demo / upload / webcam / synthetic) */}
          <SourceRenderer className="absolute inset-0 w-full h-full" />

          {/* AI overlays + examination confirmation prompt */}
          <div className="absolute inset-0 z-20">
            <OverlayRenderer
              result={displayResult}
              isInferring={isInferring && !inference.isMock}
              examPhase={examPhase}
              frozenResult={frozenResult}
              onConfirm={confirmView}
              onReacquire={reacquire}
            />
          </div>
        </div>

        {/* ── Right panel (25%, max 280px) ── */}
        <aside className="w-[260px] xl:w-[280px] flex-shrink-0 bg-surface-900 border-l border-white/5 overflow-hidden">
          <div className="h-full overflow-y-auto p-3">
            <InfoPanel inference={inference} />
          </div>
        </aside>

      </main>

      {/* Status Bar */}
      <StatusBar />

      {/* Inspector drawer — collapsible, dev-only, zero workflow impact */}
      <InspectorPanel />
    </motion.div>
  );
}

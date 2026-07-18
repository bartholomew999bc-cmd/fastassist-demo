/**
 * FAST-Assist Studio — Main Studio Page
 *
 * Layout:
 *   TopBar (fixed height)
 *   ┌─────────────────────────────┬──────────────┐
 *   │                             │              │
 *   │   Video + Overlay (75%)     │  Info Panel  │
 *   │                             │    (25%)     │
 *   └─────────────────────────────┴──────────────┘
 *   StatusBar (fixed height)
 *
 * Starts the inference loop. Wires everything together.
 */

import { motion } from 'framer-motion';
import { TopBar }         from '@/components/layout/TopBar';
import { StatusBar }      from '@/components/layout/StatusBar';
import { VideoPlayer }    from '@/components/video/VideoPlayer';
import { OverlayRenderer } from '@/components/overlay/OverlayRenderer';
import { InfoPanel }      from '@/components/panels/InfoPanel';
import { useInference }   from '@/hooks/useInference';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

export function Studio() {
  // Inference loop — returns React state (guaranteed re-render on every result)
  const inference = useInference();
  useKeyboardShortcuts();

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
          <div className="absolute inset-0 pointer-events-none z-10"
            style={{ boxShadow: 'inset 0 0 60px rgba(0,0,0,0.5)' }}
          />

          <VideoPlayer className="absolute inset-0 w-full h-full" />

          {/* AI overlays sit directly on video */}
          <div className="absolute inset-0 z-20">
            <OverlayRenderer result={inference.result} isInferring={false} />
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
    </motion.div>
  );
}

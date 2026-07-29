/**
 * FAST-Assist Studio — Provider Selector
 *
 * A compact dropdown control that displays the active inference provider
 * and allows the operator to switch between available providers at runtime.
 *
 * Placed in the TopBar center metrics row. Switching providers is seamless —
 * the examination workflow continues uninterrupted because all providers
 * produce identical InferenceResult shapes.
 *
 * When the system is in fallback mode and the Hosted AI endpoint has been
 * detected as reachable again, a recovery notice appears in the dropdown
 * so the operator can make an informed decision to switch back.
 *
 * When VITE_OPENROUTER_API_KEY is absent, Hosted AI shows a subtle indicator
 * so operators understand why it is unavailable at this build.
 */

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RiArrowDownSLine, RiCheckLine, RiErrorWarningLine } from 'react-icons/ri';
import { useAppStore } from '@/state/store';
import { PROVIDER_REGISTRY, connectionColor } from '@/services/ProviderRegistry';
import { config } from '@/config';

const DOT_COLOR: Record<string, string> = {
  teal:    'bg-teal-400',
  amber:   'bg-amber-400',
  neutral: 'bg-white/30',
  red:     'bg-red-400',
};

export function ProviderSelector() {
  const selectedProvider    = useAppStore(s => s.selectedProvider);
  const connectionStatus    = useAppStore(s => s.connectionStatus);
  const hostedAvailable     = useAppStore(s => s.hostedAvailable);
  const setSelectedProvider = useAppStore(s => s.setSelectedProvider);

  const [open, setOpen] = useState(false);
  const containerRef    = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  const color    = connectionColor(connectionStatus);
  const dotClass = DOT_COLOR[color] ?? 'bg-white/30';

  const activeDescriptor = PROVIDER_REGISTRY.find(p => p.type === selectedProvider);

  const showRecoveryNotice =
    selectedProvider === 'hosted' &&
    connectionStatus === 'fallback' &&
    hostedAvailable;

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button — same visual weight as the Metric component */}
      <button
        onClick={() => setOpen(o => !o)}
        className="flex flex-col items-center gap-0.5 group cursor-pointer"
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Switch inference provider"
      >
        <span className="label">Provider</span>
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotClass}`} />
          <motion.span
            key={activeDescriptor?.label}
            initial={{ opacity: 0.6 }}
            animate={{ opacity: 1 }}
            className="text-xs font-semibold text-white group-hover:text-teal-300 transition-colors"
          >
            {activeDescriptor?.label ?? selectedProvider}
          </motion.span>
          <RiArrowDownSLine
            size={12}
            className={`text-white/40 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            role="listbox"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0,  scale: 1 }}
            exit={{    opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.13, ease: 'easeOut' }}
            className="absolute top-full left-1/2 -translate-x-1/2 mt-2.5 w-60 bg-surface-900 border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden"
          >
            {/* Provider options */}
            {PROVIDER_REGISTRY.map(descriptor => {
              const isActive      = descriptor.type === selectedProvider;
              const isHosted      = descriptor.type === 'hosted';
              const noKey         = isHosted && !config.hasHostedAI;

              return (
                <button
                  key={descriptor.type}
                  role="option"
                  aria-selected={isActive}
                  onClick={() => {
                    setSelectedProvider(descriptor.type);
                    setOpen(false);
                  }}
                  className={[
                    'w-full flex items-start gap-3 px-4 py-3 text-left transition-colors',
                    isActive ? 'bg-teal-500/10' : 'hover:bg-white/5',
                  ].join(' ')}
                >
                  {/* Active indicator */}
                  <div className="mt-0.5 flex-shrink-0 w-4 h-4 flex items-center justify-center">
                    {isActive ? (
                      <RiCheckLine size={13} className="text-teal-400" />
                    ) : (
                      <div className="w-1.5 h-1.5 rounded-full bg-white/15" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs font-semibold ${isActive ? 'text-teal-300' : 'text-white/75'}`}>
                        {descriptor.label}
                      </span>
                      {/* Subtle indicator when API key is absent */}
                      {noKey && (
                        <RiErrorWarningLine
                          size={11}
                          className="text-amber-400/60 flex-shrink-0"
                          title="VITE_OPENROUTER_API_KEY is not set — will use Mock Mode"
                        />
                      )}
                    </div>
                    <div className="text-2xs text-white/35 mt-0.5 leading-relaxed">
                      {noKey
                        ? 'No API key — falls back to Mock Mode'
                        : descriptor.description}
                    </div>
                  </div>
                </button>
              );
            })}

            {/* Recovery notice — only when hosted recovered during fallback */}
            <AnimatePresence>
              {showRecoveryNotice && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{    opacity: 0, height: 0 }}
                  className="border-t border-white/8 bg-teal-500/5 px-4 py-2.5 overflow-hidden"
                >
                  <p className="text-2xs text-teal-400 leading-relaxed">
                    Hosted AI is now reachable. Select it above to switch back.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

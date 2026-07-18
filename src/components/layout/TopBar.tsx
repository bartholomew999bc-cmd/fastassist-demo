/**
 * FAST-Assist Studio — Top Navigation Bar
 *
 * Displays logo, live indicator, backend status, latency, FPS,
 * current backend label, theme toggle, and fullscreen button.
 */

import { motion } from 'framer-motion';
import {
  RiFullscreenLine,
  RiFullscreenExitLine,
  RiMoonLine,
  RiSunLine,
  RiWifiLine,
  RiSignalWifiErrorLine,
} from 'react-icons/ri';
import { useAppStore } from '@/state/store';
import { StatusDot } from '@/components/ui/StatusDot';
import { APP_NAME, APP_VERSION } from '@/config';

export function TopBar() {
  const {
    connectionStatus,
    theme,
    isFullscreen,
    metrics,
    isMockMode,
    backendType,
    setTheme,
    setFullscreen,
  } = useAppStore();

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setFullscreen(false);
    }
  };

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');

  return (
    <header className="relative z-30 flex items-center justify-between px-5 h-14 bg-surface-900/90 backdrop-blur-sm border-b border-white/5">
      {/* Left — Logo */}
      <div className="flex items-center gap-4">
        {/* Logo mark */}
        <div className="flex items-center gap-2.5">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="28" height="28" rx="7" fill="#14b8a6" fillOpacity="0.15"/>
            <path d="M7 14h4M17 14h4M14 7v4M14 17v4" stroke="#14b8a6" strokeWidth="2" strokeLinecap="round"/>
            <circle cx="14" cy="14" r="3.5" stroke="#14b8a6" strokeWidth="1.5"/>
          </svg>
          <div>
            <span className="text-sm font-semibold tracking-tight text-white">{APP_NAME}</span>
            <span className="hidden lg:inline text-2xs text-white/30 ml-2">v{APP_VERSION}</span>
          </div>
        </div>

        {/* Live pill */}
        <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-full bg-teal-500/10 border border-teal-500/20">
          <span className="live-dot" />
          <span className="text-2xs font-semibold uppercase tracking-widest text-teal-400">Live</span>
        </div>
      </div>

      {/* Center — Metrics */}
      <div className="hidden md:flex items-center gap-6">
        <Metric label="Latency" value={metrics.inferenceLatency > 0 ? `${metrics.inferenceLatency} ms` : '—'} />
        <Divider />
        <Metric label="FPS" value={metrics.fps > 0 ? String(metrics.fps) : '—'} />
        <Divider />
        <Metric
          label="Backend"
          value={isMockMode ? 'Mock' : backendType.toUpperCase()}
          highlight={!isMockMode}
        />
        <Divider />
        <StatusDot status={connectionStatus} size="sm" />
      </div>

      {/* Right — Controls */}
      <div className="flex items-center gap-1.5">
        {/* Network status icon */}
        <div className="hidden sm:flex items-center justify-center w-8 h-8">
          {connectionStatus === 'error' ? (
            <RiSignalWifiErrorLine className="text-red-400" size={16} />
          ) : (
            <RiWifiLine className={connectionStatus === 'connected' ? 'text-teal-400' : 'text-white/30'} size={16} />
          )}
        </div>

        {/* Theme toggle */}
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={toggleTheme}
          className="flex items-center justify-center w-8 h-8 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors"
          title="Toggle theme (T)"
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <RiSunLine size={15} /> : <RiMoonLine size={15} />}
        </motion.button>

        {/* Fullscreen toggle */}
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={toggleFullscreen}
          className="flex items-center justify-center w-8 h-8 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors"
          title="Toggle fullscreen (F)"
          aria-label="Toggle fullscreen"
        >
          {isFullscreen ? <RiFullscreenExitLine size={15} /> : <RiFullscreenLine size={15} />}
        </motion.button>
      </div>
    </header>
  );
}

function Metric({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="label">{label}</span>
      <motion.span
        key={value}
        initial={{ opacity: 0.6 }}
        animate={{ opacity: 1 }}
        className={`text-xs font-semibold tabular-nums ${highlight ? 'text-teal-400' : 'text-white'}`}
      >
        {value}
      </motion.span>
    </div>
  );
}

function Divider() {
  return <div className="h-5 w-px bg-white/8" />;
}

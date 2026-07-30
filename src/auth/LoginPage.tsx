/**
 * FAST-Assist Studio — Login Page
 *
 * Shown to unauthenticated users. Provides Google Sign-In.
 * The design mirrors the existing dark theme and teal accent palette.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FcGoogle } from 'react-icons/fc';
import { RiAlertLine, RiLoader4Line } from 'react-icons/ri';
import { useAuth } from './useAuth';

export function LoginPage() {
  const { signInWithGoogle, error, clearError, loading } = useAuth();
  const [signingIn, setSigningIn] = useState(false);

  const handleGoogleSignIn = async () => {
    clearError();
    setSigningIn(true);
    await signInWithGoogle();
    setSigningIn(false);
  };

  const busy = signingIn || loading;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-surface-950 px-4">
      {/* Subtle grid background */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(#14b8a6 1px, transparent 1px), linear-gradient(90deg, #14b8a6 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-sm"
      >
        {/* Card */}
        <div className="rounded-2xl bg-surface-900 border border-white/8 shadow-2xl overflow-hidden">
          {/* Header accent */}
          <div className="h-1 w-full bg-gradient-to-r from-teal-500 via-teal-400 to-cyan-400" />

          <div className="px-8 pt-8 pb-10 flex flex-col items-center gap-6">
            {/* Logo */}
            <div className="flex flex-col items-center gap-3">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1, duration: 0.35 }}
                className="w-16 h-16 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center"
              >
                <svg width="36" height="36" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect width="28" height="28" rx="7" fill="#14b8a6" fillOpacity="0.15"/>
                  <path d="M7 14h4M17 14h4M14 7v4M14 17v4" stroke="#14b8a6" strokeWidth="2" strokeLinecap="round"/>
                  <circle cx="14" cy="14" r="3.5" stroke="#14b8a6" strokeWidth="1.5"/>
                </svg>
              </motion.div>

              <div className="text-center">
                <h1 className="text-xl font-semibold tracking-tight text-white">
                  FAST-Assist Studio
                </h1>
                <p className="mt-1 text-sm text-white/40">
                  AI-assisted FAST Ultrasound Guidance
                </p>
              </div>
            </div>

            {/* Divider */}
            <div className="w-full h-px bg-white/6" />

            {/* Error message */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="w-full overflow-hidden"
                >
                  <div className="flex items-start gap-2.5 rounded-lg bg-red-500/10 border border-red-500/20 px-3.5 py-3 text-sm text-red-300">
                    <RiAlertLine size={16} className="mt-0.5 shrink-0 text-red-400" />
                    <span>{error}</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Sign-in button */}
            <motion.button
              whileTap={busy ? {} : { scale: 0.97 }}
              onClick={handleGoogleSignIn}
              disabled={busy}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl
                         bg-white/5 border border-white/10 text-white text-sm font-medium
                         hover:bg-white/8 hover:border-white/16 transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy ? (
                <RiLoader4Line size={18} className="animate-spin text-teal-400" />
              ) : (
                <FcGoogle size={18} />
              )}
              <span>{busy ? 'Signing in…' : 'Sign in with Google'}</span>
            </motion.button>

            {/* Footer note */}
            <p className="text-center text-2xs text-white/25 leading-relaxed">
              Access is restricted to authorised personnel.<br />
              Your session will persist across page refreshes.
            </p>
          </div>
        </div>

        {/* Version tag */}
        <p className="mt-4 text-center text-2xs text-white/20">
          FAST-Assist Studio · Authorised use only
        </p>
      </motion.div>
    </div>
  );
}

/**
 * FAST-Assist Studio — Access Denied Page
 *
 * Shown when a user has successfully authenticated with Google but is not on
 * the Firestore authorized_users allowlist, or has been disabled.
 *
 * The page is a dead end — the user has already been signed out. They must
 * contact an administrator to be granted access.
 */

import { motion } from 'framer-motion';
import { RiShieldLine } from 'react-icons/ri';

export function AccessDeniedPage() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-surface-950 px-4">
      {/* Subtle grid background */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(#ef4444 1px, transparent 1px), linear-gradient(90deg, #ef4444 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-sm"
      >
        <div className="rounded-2xl bg-surface-900 border border-white/8 shadow-2xl overflow-hidden">
          {/* Header accent — red to signal denial */}
          <div className="h-1 w-full bg-gradient-to-r from-red-600 via-red-500 to-rose-500" />

          <div className="px-8 pt-8 pb-10 flex flex-col items-center gap-6">
            {/* Icon */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1, duration: 0.35 }}
              className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center"
            >
              <RiShieldLine size={32} className="text-red-400" />
            </motion.div>

            {/* Heading */}
            <div className="text-center">
              <h1 className="text-xl font-semibold tracking-tight text-white">
                Access Denied
              </h1>
              <p className="mt-1 text-sm text-white/40">
                FAST-Assist Studio
              </p>
            </div>

            {/* Divider */}
            <div className="w-full h-px bg-white/6" />

            {/* Message */}
            <p className="text-center text-sm text-white/60 leading-relaxed">
              Your Google account has successfully authenticated but is not
              authorised to use FAST-Assist Studio.
            </p>
            <p className="text-center text-sm text-white/60 leading-relaxed -mt-3">
              Please contact the administrator if you believe this is an error.
            </p>

            {/* Divider */}
            <div className="w-full h-px bg-white/6" />

            {/* Reload hint */}
            <p className="text-center text-2xs text-white/25 leading-relaxed">
              You have been signed out automatically.<br />
              Reload the page to try a different account.
            </p>
          </div>
        </div>

        <p className="mt-4 text-center text-2xs text-white/20">
          FAST-Assist Studio · Authorised use only
        </p>
      </motion.div>
    </div>
  );
}

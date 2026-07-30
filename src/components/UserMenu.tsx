/**
 * FAST-Assist Studio — User Menu
 *
 * Displays the signed-in user's avatar, display name, and email in the TopBar.
 * Includes a Sign Out button. Designed to sit in the right section of the header.
 */

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RiLogoutBoxLine, RiUserLine } from 'react-icons/ri';
import { useAuth } from '@/auth/useAuth';

export function UserMenu() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!user) return null;

  const displayName = user.displayName ?? user.email ?? 'User';
  const email = user.email ?? '';
  const photoURL = user.photoURL;
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div ref={ref} className="relative">
      {/* Avatar button */}
      <motion.button
        whileTap={{ scale: 0.93 }}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-center w-8 h-8 rounded-lg overflow-hidden
                   ring-1 ring-white/10 hover:ring-teal-500/50 transition-all"
        title={displayName}
        aria-label="User menu"
        aria-expanded={open}
      >
        {photoURL ? (
          <img src={photoURL} alt={displayName} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-teal-500/20 text-teal-300 text-xs font-semibold">
            {initial}
          </div>
        )}
      </motion.button>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 mt-2 w-56 rounded-xl bg-surface-900 border border-white/8
                       shadow-2xl shadow-black/40 overflow-hidden z-50"
          >
            {/* User info */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/6">
              <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0 ring-1 ring-white/10">
                {photoURL ? (
                  <img src={photoURL} alt={displayName} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-teal-500/20 text-teal-300 text-xs font-semibold">
                    {initial}
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white truncate">{displayName}</p>
                {email && (
                  <p className="text-2xs text-white/40 truncate">{email}</p>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="p-1.5">
              {/* Profile row (non-interactive, for visual context) */}
              <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-white/30">
                <RiUserLine size={14} />
                <span className="text-xs">Signed in</span>
              </div>

              <button
                onClick={async () => {
                  setOpen(false);
                  await signOut();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg
                           text-red-400 hover:bg-red-500/10 transition-colors text-xs font-medium"
              >
                <RiLogoutBoxLine size={14} />
                Sign out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

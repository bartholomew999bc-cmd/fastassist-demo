/**
 * FAST-Assist Studio — Protected Route Guard
 *
 * Wraps any route that requires authentication + authorization.
 *
 * State machine (driven by AuthProvider.authStatus):
 *   checking-auth          → null (splash screen already visible — no flicker)
 *   checking-authorization → full-screen "Checking authorisation…" overlay
 *   authorized             → renders children
 *   unauthenticated        → renders <LoginPage />
 *   access-denied          → renders <AccessDeniedPage />
 *   error                  → renders <LoginPage /> with error already in context
 *
 * Usage:
 *   <Route path="/" element={<ProtectedRoute><Studio /></ProtectedRoute>} />
 */

import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { RiLoader4Line } from 'react-icons/ri';
import { useAuth } from './useAuth';
import { LoginPage } from './LoginPage';
import { AccessDeniedPage } from './AccessDeniedPage';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { authStatus } = useAuth();

  switch (authStatus) {
    // ── Phase 1: Firebase resolving persisted session ─────────────────────────
    case 'checking-auth':
      // Splash screen is already covering the viewport — render nothing.
      return null;

    // ── Phase 2: Querying Firestore allowlist ─────────────────────────────────
    case 'checking-authorization':
      return (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-surface-950">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col items-center gap-4"
          >
            <RiLoader4Line size={28} className="animate-spin text-teal-400" />
            <p className="text-sm text-white/50 tracking-wide">
              Checking authorisation…
            </p>
          </motion.div>
        </div>
      );

    // ── Authorized ────────────────────────────────────────────────────────────
    case 'authorized':
      return <>{children}</>;

    // ── Not authenticated ─────────────────────────────────────────────────────
    case 'unauthenticated':
    case 'error':
      return <LoginPage />;

    // ── On the allowlist check failed ─────────────────────────────────────────
    case 'access-denied':
      return <AccessDeniedPage />;

    default:
      return null;
  }
}

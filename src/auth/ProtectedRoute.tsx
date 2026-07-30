/**
 * FAST-Assist Studio — Protected Route Guard
 *
 * Wraps any route that requires authentication.
 *
 * Behaviour:
 *   - While Firebase resolves the initial auth state → renders nothing (no flicker).
 *   - User is not authenticated → renders <LoginPage />.
 *   - User is authenticated → renders children.
 *
 * Usage:
 *   <Route path="/" element={<ProtectedRoute><Studio /></ProtectedRoute>} />
 */

import { ReactNode } from 'react';
import { useAuth } from './useAuth';
import { LoginPage } from './LoginPage';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth();

  // While Firebase resolves the persisted session, render nothing.
  // The splash screen is already visible so there is no blank flash.
  if (loading) return null;

  if (!user) return <LoginPage />;

  return <>{children}</>;
}

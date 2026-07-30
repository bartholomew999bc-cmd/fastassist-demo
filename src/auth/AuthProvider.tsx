/**
 * FAST-Assist Studio — Authentication Provider
 *
 * Provides authentication state to the entire application via React context.
 * Listens to Firebase Auth state changes and exposes:
 *   - user      — the currently signed-in Firebase User, or null
 *   - loading   — true while the initial auth state is being resolved
 *   - signInWithGoogle — initiates Google Sign-In via popup
 *   - signOut   — signs the user out
 *   - error     — last authentication error message, or null
 *
 * Additional providers (Email/Password, Microsoft, etc.) can be added here
 * by importing the relevant provider from 'firebase/auth' and exposing a new
 * sign-in method without touching any other file.
 *
 * ── Development bypass ───────────────────────────────────────────────────────
 * When BOTH conditions are true at the same time:
 *   1. import.meta.env.DEV === true   (Vite dev server only — never production)
 *   2. VITE_DEV_AUTH_BYPASS === 'true'
 * …the provider immediately presents a mock authenticated user and skips all
 * Firebase calls. Vite replaces import.meta.env.DEV with `false` at build time,
 * so the entire bypass branch is dead-code-eliminated from production bundles
 * even if VITE_DEV_AUTH_BYPASS is accidentally present in the environment.
 */

import {
  createContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  AuthError,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';

// ── Development bypass flag ───────────────────────────────────────────────────
//
// This constant is evaluated once at module load time. In production builds
// import.meta.env.DEV is statically replaced with `false` by Vite, making the
// entire expression `false && ...` which tree-shakes all bypass code out of the
// bundle. The VITE_DEV_AUTH_BYPASS variable is therefore unreachable in prod.

export const DEV_AUTH_BYPASS_ACTIVE: boolean =
  import.meta.env.DEV === true &&
  import.meta.env.VITE_DEV_AUTH_BYPASS === 'true';

// ── Mock dev user ─────────────────────────────────────────────────────────────
//
// Satisfies the fields consumed by UserMenu and ProtectedRoute. Only used when
// DEV_AUTH_BYPASS_ACTIVE is true — never reaches a production bundle.

const DEV_USER = DEV_AUTH_BYPASS_ACTIVE
  ? ({
      uid: 'dev-user',
      displayName: 'FAST-Assist Developer',
      email: 'developer@fastassist.local',
      photoURL: null,
      emailVerified: true,
      isAnonymous: false,
      providerData: [],
    } as unknown as User)
  : null;

// ── Types ────────────────────────────────────────────────────────────────────

export interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

// ── Context ──────────────────────────────────────────────────────────────────

export const AuthContext = createContext<AuthState | null>(null);

// ── Error messages ───────────────────────────────────────────────────────────

function friendlyError(err: unknown): string {
  if (err instanceof Error) {
    const code = (err as AuthError).code ?? '';
    switch (code) {
      case 'auth/popup-blocked':
        return 'Sign-in popup was blocked. Please allow popups for this site.';
      case 'auth/popup-closed-by-user':
        return 'Sign-in was cancelled. Please try again.';
      case 'auth/cancelled-popup-request':
        return 'Sign-in was cancelled. Please try again.';
      case 'auth/network-request-failed':
        return 'Network error. Please check your connection and try again.';
      case 'auth/too-many-requests':
        return 'Too many sign-in attempts. Please wait a moment and try again.';
      case 'auth/user-disabled':
        return 'This account has been disabled. Please contact support.';
      default:
        return err.message || 'Authentication failed. Please try again.';
    }
  }
  return 'An unexpected error occurred. Please try again.';
}

// ── Provider ─────────────────────────────────────────────────────────────────

const googleProvider = new GoogleAuthProvider();

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  // In dev-bypass mode, seed state with the mock user immediately so there is
  // zero loading flash and no Firebase network calls are made.
  const [user, setUser] = useState<User | null>(DEV_AUTH_BYPASS_ACTIVE ? DEV_USER : null);
  const [loading, setLoading] = useState(!DEV_AUTH_BYPASS_ACTIVE);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to Firebase auth state — skipped entirely in dev-bypass mode.
  useEffect(() => {
    if (DEV_AUTH_BYPASS_ACTIVE) return;

    const unsubscribe = onAuthStateChanged(
      auth,
      (firebaseUser) => {
        setUser(firebaseUser);
        setLoading(false);
      },
      (err) => {
        console.error('[FAST-Assist][Auth] Auth state error:', err);
        setError(friendlyError(err));
        setLoading(false);
      },
    );
    return unsubscribe;
  }, []);

  const signInWithGoogle = useCallback(async () => {
    // No-op in dev-bypass mode — the user is already "signed in".
    if (DEV_AUTH_BYPASS_ACTIVE) return;

    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      // auth/cancelled-popup-request fires when the user opens a second popup
      // before the first one completes — treat it as a non-error cancellation.
      const code = (err as AuthError).code;
      if (
        code !== 'auth/popup-closed-by-user' &&
        code !== 'auth/cancelled-popup-request'
      ) {
        setError(friendlyError(err));
      }
    }
  }, []);

  const signOut = useCallback(async () => {
    // No-op in dev-bypass mode — reload to re-enter bypass state if needed.
    if (DEV_AUTH_BYPASS_ACTIVE) return;

    setError(null);
    try {
      await firebaseSignOut(auth);
    } catch (err) {
      setError(friendlyError(err));
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return (
    <AuthContext.Provider value={{ user, loading, error, signInWithGoogle, signOut, clearError }}>
      {children}
    </AuthContext.Provider>
  );
}

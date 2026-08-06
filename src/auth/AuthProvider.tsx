/**
 * FAST-Assist Studio — Authentication + Authorization Provider
 *
 * Provides authentication AND authorization state to the entire application.
 * Implements a two-phase check:
 *
 *   Phase 1 — Authentication  : Firebase resolves the persisted Google session.
 *   Phase 2 — Authorization   : Firestore `authorized_users/{uid}` is fetched.
 *                                The user must exist and have `enabled == true`.
 *                                If not, they are signed out immediately.
 *
 * The `authStatus` field drives the state machine consumed by ProtectedRoute:
 *   checking-auth          → Firebase resolving persisted session
 *   checking-authorization → Firebase user found; querying Firestore allowlist
 *   authorized             → User is on the allowlist and enabled
 *   unauthenticated        → No Firebase user (show login page)
 *   access-denied          → Authenticated but not allowlisted / disabled
 *   error                  → Unexpected failure
 *
 * ── Development bypass ───────────────────────────────────────────────────────
 * When BOTH conditions are true:
 *   1. import.meta.env.DEV === true   (Vite dev server only — never production)
 *   2. VITE_DEV_AUTH_BYPASS === 'true'
 * …the provider immediately presents a mock authorized user with role 'operator'
 * and skips all Firebase + Firestore calls.
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
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import type { UserRole, AuthStatus } from '@/types';
import { logger } from '@/utils/logger';
import { useAppStore } from '@/state/store';

// ── Development bypass flag ───────────────────────────────────────────────────
//
// In production builds import.meta.env.DEV is statically replaced with `false`,
// making this expression `false && ...` — tree-shaking all bypass code out.

export const DEV_AUTH_BYPASS_ACTIVE: boolean =
  import.meta.env.DEV === true &&
  import.meta.env.VITE_DEV_AUTH_BYPASS === 'true';

// ── Mock dev user ─────────────────────────────────────────────────────────────

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
  /** The currently signed-in Firebase User, or null. */
  user: User | null;
  /**
   * Full auth state machine status.
   * ProtectedRoute and the loading overlay key off this.
   */
  authStatus: AuthStatus;
  /**
   * True while any async auth/authz check is in progress.
   * Convenience alias for authStatus === 'checking-auth' | 'checking-authorization'.
   */
  loading: boolean;
  /** Role from the Firestore authorized_users document, null when not authorized. */
  userRole: UserRole | null;
  /** Last authentication error message shown to the user, or null. */
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
  // Dev-bypass: seed authorized state immediately, skip all Firebase calls.
  const [user,       setUser]       = useState<User | null>(DEV_AUTH_BYPASS_ACTIVE ? DEV_USER : null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>(DEV_AUTH_BYPASS_ACTIVE ? 'authorized' : 'checking-auth');
  const [userRole,   setUserRole]   = useState<UserRole | null>(DEV_AUTH_BYPASS_ACTIVE ? 'operator' : null);
  const [error,      setError]      = useState<string | null>(null);

  const loading = authStatus === 'checking-auth' || authStatus === 'checking-authorization';

  // Subscribe to Firebase auth state — skipped entirely in dev-bypass mode.
  useEffect(() => {
    if (DEV_AUTH_BYPASS_ACTIVE) return;

    const unsubscribe = onAuthStateChanged(
      auth,
      async (firebaseUser) => {
        if (!firebaseUser) {
          // No authenticated user — show login page.
          setUser(null);
          setUserRole(null);
          setAuthStatus('unauthenticated');
          return;
        }

        // Firebase user found — check the Firestore allowlist.
        logger.info('Auth', `User authenticated: ${firebaseUser.uid}`);
        setAuthStatus('checking-authorization');

        try {
          const docRef  = doc(db, 'authorized_users', firebaseUser.uid);
          const docSnap = await getDoc(docRef);

          if (!docSnap.exists()) {
            logger.warn('Auth', `Unknown user attempted access: uid=${firebaseUser.uid} email=${firebaseUser.email}`);
            // Sign out immediately — do not expose the app to unlisted users.
            await firebaseSignOut(auth);
            setUser(null);
            setUserRole(null);
            useAppStore.getState().setUserRole(null);
            setAuthStatus('access-denied');
            return;
          }

          const data = docSnap.data();

          if (data.enabled !== true) {
            logger.warn('Auth', `Disabled user attempted access: uid=${firebaseUser.uid} email=${firebaseUser.email}`);
            await firebaseSignOut(auth);
            setUser(null);
            setUserRole(null);
            useAppStore.getState().setUserRole(null);
            setAuthStatus('access-denied');
            return;
          }

          const role = data.role as UserRole;
          logger.info('Auth', `User authorised: uid=${firebaseUser.uid} role=${role}`);
          setUser(firebaseUser);
          setUserRole(role);
          useAppStore.getState().setUserRole(role);
          setAuthStatus('authorized');
        } catch (err) {
          logger.error('Auth', 'Authorization check failed', err);
          setUser(null);
          setUserRole(null);
          setAuthStatus('error');
          setError('Authorization check failed. Please try again.');
        }
      },
      (err) => {
        logger.error('Auth', 'Auth state error', err);
        setError(friendlyError(err));
        setAuthStatus('error');
      },
    );

    return unsubscribe;
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (DEV_AUTH_BYPASS_ACTIVE) return;
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
      // onAuthStateChanged fires after sign-in and drives the state machine.
    } catch (err) {
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
    if (DEV_AUTH_BYPASS_ACTIVE) return;
    setError(null);
    try {
      await firebaseSignOut(auth);
      // onAuthStateChanged fires → sets unauthenticated.
    } catch (err) {
      setError(friendlyError(err));
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return (
    <AuthContext.Provider value={{ user, authStatus, loading, userRole, error, signInWithGoogle, signOut, clearError }}>
      {children}
    </AuthContext.Provider>
  );
}

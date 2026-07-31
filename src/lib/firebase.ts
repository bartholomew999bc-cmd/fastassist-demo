/**
 * FAST-Assist Studio — Firebase Initialisation
 *
 * Initialises the Firebase App and Authentication service.
 * Analytics is conditionally enabled only in browser environments to avoid
 * SSR / build-time issues.
 *
 * All Firebase configuration is read from Vite environment variables so that
 * no credentials are hard-coded. Additional providers (Email/Password,
 * Microsoft, etc.) can be added by importing from 'firebase/auth' and
 * registering them in auth/AuthProvider.tsx.
 *
 * ── Development bypass ───────────────────────────────────────────────────────
 * When DEV_AUTH_BYPASS_ACTIVE is true, Firebase is never initialised.
 * AuthProvider guards every Firebase call behind the same flag, so the null
 * stubs exported here are never actually invoked.
 * Vite replaces import.meta.env.DEV with `false` in production builds,
 * dead-code-eliminating this entire branch from the production bundle.
 */

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';

// ── Dev bypass check ──────────────────────────────────────────────────────────
// Mirrors the check in AuthProvider.tsx. In production builds import.meta.env.DEV
// is statically replaced with `false`, so the entire bypass path is tree-shaken.

const DEV_BYPASS =
  import.meta.env.DEV === true &&
  import.meta.env.VITE_DEV_AUTH_BYPASS === 'true';

// ── Conditional initialisation ────────────────────────────────────────────────

let _app: FirebaseApp | null  = null;
let _auth: Auth | null        = null;

if (!DEV_BYPASS) {
  const firebaseConfig = {
    apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId:             import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId:     import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
  };

  // Guard against double-initialisation (e.g. HMR in development)
  _app  = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
  _auth = getAuth(_app);

  // Analytics: only import in browser environments with a valid measurementId
  // to avoid SSR/SSG build failures.
  if (typeof window !== 'undefined' && firebaseConfig.measurementId) {
    import('firebase/analytics').then(({ getAnalytics }) => {
      try {
        getAnalytics(_app!);
      } catch {
        // Analytics unavailable in this environment — silently skip.
      }
    });
  }
}

// AuthProvider guards every Firebase call behind DEV_AUTH_BYPASS_ACTIVE, so
// these are never invoked when _auth / _app are null.
export const auth = _auth as Auth;
export default _app as FirebaseApp;

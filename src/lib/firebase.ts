/**
 * FAST-Assist Studio — Firebase Initialisation
 *
 * Initialises the Firebase App, Authentication, and Firestore services.
 * Analytics is conditionally enabled only in browser environments to avoid
 * SSR / build-time issues.
 *
 * Firebase SDK configuration is embedded directly in the frontend bundle —
 * this is the standard practice for client-side Firebase apps. The config
 * identifies the Firebase project but does not grant any access beyond what
 * Firebase Security Rules allow.
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
import { getFirestore, type Firestore } from 'firebase/firestore';

// ── Dev bypass check ──────────────────────────────────────────────────────────
// Mirrors the check in AuthProvider.tsx. In production builds import.meta.env.DEV
// is statically replaced with `false`, so the entire bypass path is tree-shaken.

const DEV_BYPASS =
  import.meta.env.DEV === true &&
  import.meta.env.VITE_DEV_AUTH_BYPASS === 'true';

// ── Firebase project configuration ───────────────────────────────────────────
// Public SDK config — not a secret. Firebase access is controlled by
// Security Rules, not by keeping this object private.

const firebaseConfig = {
  apiKey:            'AIzaSyCZHpEPex2OoN7X4MPmMh0Vx8q4TpsaBeo',
  authDomain:        'fastassist-62976.firebaseapp.com',
  projectId:         'fastassist-62976',
  storageBucket:     'fastassist-62976.firebasestorage.app',
  messagingSenderId: '566469349570',
  appId:             '1:566469349570:web:b7ec2dadcfb25ef38e6b5b',
  measurementId:     'G-N7H2DE7PYF',
};

// ── Conditional initialisation ────────────────────────────────────────────────

let _app:  FirebaseApp | null = null;
let _auth: Auth        | null = null;
let _db:   Firestore   | null = null;

if (!DEV_BYPASS) {
  // Guard against double-initialisation (e.g. HMR in development)
  _app  = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
  _auth = getAuth(_app);
  _db   = getFirestore(_app);

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
// these are never invoked when _auth / _app / _db are null.
export const auth = _auth as Auth;
export const db   = _db   as Firestore;
export default _app as FirebaseApp;

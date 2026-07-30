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
 */

import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';

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
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);

// Analytics: only import in browser environments with a valid measurementId
// to avoid SSR/SSG build failures.
if (typeof window !== 'undefined' && firebaseConfig.measurementId) {
  import('firebase/analytics').then(({ getAnalytics }) => {
    try {
      getAnalytics(app);
    } catch {
      // Analytics unavailable in this environment — silently skip.
    }
  });
}

export default app;

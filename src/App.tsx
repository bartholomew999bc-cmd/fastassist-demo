/**
 * FAST-Assist Studio — Root Application
 *
 * Manages the splash → studio transition.
 * Wraps the app with React Query, Router, AuthProvider, and IngestProvider.
 *
 * Studio is lazy-loaded to allow the splash screen to render immediately
 * while the main application bundle is parsed and initialised.
 *
 * Authentication wraps the application at the outermost layer so that the
 * inference pipeline, video ingest, and all Studio routes are fully protected.
 * Unauthenticated users see only the LoginPage (rendered by ProtectedRoute).
 */

import { useState, useCallback, lazy, Suspense } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AnimatePresence } from 'framer-motion';
import { IngestProvider } from '@/ingest/IngestContext';
import { SplashScreen } from '@/components/SplashScreen';
import { AuthProvider } from '@/auth/AuthProvider';
import { ProtectedRoute } from '@/auth/ProtectedRoute';

// Lazy-load Studio so the splash renders before the main chunk is parsed
const Studio = lazy(() =>
  import('@/pages/Studio').then(m => ({ default: m.Studio }))
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

export function App() {
  const [showSplash, setShowSplash] = useState(true);

  const handleSplashComplete = useCallback(() => {
    setShowSplash(false);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {/*
         * AuthProvider sits outside IngestProvider so that the ingest
         * pipeline never starts for unauthenticated users. ProtectedRoute
         * gates everything below it — unauthenticated visitors see only
         * the LoginPage.
         */}
        <AuthProvider>
          <ProtectedRoute>
            {/*
             * IngestProvider must wrap Studio so that useIngestManager() is
             * available inside useInference and all child components.
             * The pipeline starts as soon as the provider mounts.
             */}
            <IngestProvider>
              {/*
               * Suspense fallback is the dark background — the splash screen
               * renders on top immediately, hiding any layout shift.
               */}
              <Suspense fallback={<div className="fixed inset-0 bg-surface-950" />}>
                {/* Studio renders behind the splash so the pipeline starts early */}
                <Studio />
              </Suspense>

              <AnimatePresence>
                {showSplash && (
                  <SplashScreen key="splash" onComplete={handleSplashComplete} />
                )}
              </AnimatePresence>
            </IngestProvider>
          </ProtectedRoute>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

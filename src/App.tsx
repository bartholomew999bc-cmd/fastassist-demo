/**
 * FAST-Assist Studio — Root Application
 *
 * Manages the splash → studio transition.
 * Wraps the app with React Query, Router, and IngestProvider.
 */

import { useState, useCallback } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AnimatePresence } from 'framer-motion';
import { IngestProvider } from '@/ingest/IngestContext';
import { SplashScreen } from '@/components/SplashScreen';
import { Studio } from '@/pages/Studio';

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
         * IngestProvider must wrap Studio so that useIngestManager() is
         * available inside useInference and all child components.
         * The pipeline starts as soon as the provider mounts.
         */}
        <IngestProvider>
          {/* Studio renders behind the splash so the pipeline starts early */}
          <Studio />
          <AnimatePresence>
            {showSplash && (
              <SplashScreen key="splash" onComplete={handleSplashComplete} />
            )}
          </AnimatePresence>
        </IngestProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

/**
 * FAST-Assist Studio — Root Application
 *
 * Manages the splash → studio transition.
 * Wraps the app with React Query and Router providers.
 */

import { useState, useCallback } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AnimatePresence } from 'framer-motion';
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
  const [showSplash, setShowSplash] = useState(false);

  const handleSplashComplete = useCallback(() => {
    setShowSplash(false);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {/* Studio renders behind the splash so useInference starts early */}
        <Studio />
        <AnimatePresence>
          {showSplash && (
            <SplashScreen key="splash" onComplete={handleSplashComplete} />
          )}
        </AnimatePresence>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

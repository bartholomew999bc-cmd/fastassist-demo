/**
 * FAST-Assist Studio — Application Entry Point
 */

import { createRoot } from 'react-dom/client';
import '@/styles/globals.css';
import { App } from './App';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

// Note: StrictMode is intentionally omitted in this real-time demo application.
// The double-invocation of effects in development mode conflicts with the
// inference loop's start/stop lifecycle. Production builds are unaffected.
createRoot(root).render(<App />);

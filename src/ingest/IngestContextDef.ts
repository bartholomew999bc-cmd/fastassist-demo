/**
 * FAST-Assist Studio — Ingest Context Definition
 *
 * Defines and exports the React context object so it can be shared between
 * IngestContext.tsx (the Provider component) and useIngest.ts (the accessor
 * hook) without either file exporting both a component and a non-component,
 * which would violate react-refresh/only-export-components.
 */

import { createContext } from 'react';
import type { VideoIngestManager } from './VideoIngestManager';

export const IngestContext = createContext<VideoIngestManager | null>(null);

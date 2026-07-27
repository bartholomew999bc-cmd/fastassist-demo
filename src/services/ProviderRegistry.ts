/**
 * FAST-Assist Studio — Provider Registry
 *
 * Maps ProviderType values to user-facing metadata and derives
 * display labels from connection status.
 *
 * This is the single place that knows how to translate internal
 * provider/connection state into human-readable strings and colours.
 * No React, no side effects — safe to import anywhere.
 */

import type { ProviderType, ConnectionStatus } from '@/types';

// ─── Provider descriptors ─────────────────────────────────────────────────────

export interface ProviderDescriptor {
  type:        ProviderType;
  /** Short display name shown in the UI */
  label:       string;
  /** One-line description shown in the selector dropdown */
  description: string;
}

/**
 * All known providers in display order.
 * Add future providers here — no other file needs to change.
 */
export const PROVIDER_REGISTRY: ProviderDescriptor[] = [
  {
    type:        'hosted',
    label:       'Hosted AI',
    description: 'Live AI model inference',
  },
  {
    type:        'mock',
    label:       'Mock Provider',
    description: 'Offline demonstration',
  },
];

// ─── Label helpers ────────────────────────────────────────────────────────────

/** Returns the display label for a provider type (e.g. "Hosted AI"). */
export function providerLabel(type: ProviderType): string {
  return PROVIDER_REGISTRY.find(p => p.type === type)?.label ?? type;
}

/**
 * Returns the status sub-label shown beneath the provider name.
 *
 * Examples:
 *   hosted + connected  → "Connected"
 *   hosted + fallback   → "Unavailable — Fallback Active"
 *   mock   + mock       → "Offline Demonstration"
 */
export function connectionSublabel(
  status:   ConnectionStatus,
  provider: ProviderType,
): string {
  switch (status) {
    case 'connected':  return 'Connected';
    case 'fallback':   return 'Unavailable — Fallback Active';
    case 'mock':       return provider === 'mock' ? 'Offline Demonstration' : 'Mock Mode';
    case 'connecting': return 'Connecting…';
    case 'error':      return 'Error';
    default:           return '';
  }
}

/** Returns the semantic colour for a given connection status. */
export function connectionColor(
  status: ConnectionStatus,
): 'teal' | 'amber' | 'neutral' | 'red' {
  switch (status) {
    case 'connected':  return 'teal';
    case 'mock':       return 'amber';
    case 'fallback':   return 'amber';
    case 'connecting': return 'neutral';
    case 'error':      return 'red';
    default:           return 'neutral';
  }
}

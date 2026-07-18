/**
 * FAST-Assist Studio — Ingest Event Bus
 *
 * Typed publish/subscribe system for the video ingest pipeline.
 * All pipeline stages communicate through this bus so they remain
 * fully decoupled from each other and from React.
 */

import type { ProcessedFrame, SourceKind, SourceStatus, PlaybackState } from './IVideoSource';

// ─── Event Payloads ───────────────────────────────────────────────────────────

export interface SourceConnectedPayload    { kind: SourceKind; label: string }
export interface SourceDisconnectedPayload { kind: SourceKind; reason: string }
export interface PlaybackStartedPayload    { kind: SourceKind }
export interface PlaybackPausedPayload     { kind: SourceKind }
export interface PlaybackStoppedPayload    { kind: SourceKind }
export interface FrameAvailablePayload     { frame: ProcessedFrame }
export interface FrameDroppedPayload       { frameNumber: number; reason: string }
export interface FrameSkippedPayload       { frameNumber: number; reason: string }
export interface InferenceRequestedPayload { frameNumber: number }
export interface InferenceCompletedPayload { frameNumber: number; latencyMs: number }
export interface ErrorOccurredPayload      { kind: SourceKind; error: Error; recoverable: boolean }
export interface StatusChangedPayload      { kind: SourceKind; status: SourceStatus; playbackState: PlaybackState }
export interface ReconnectingPayload       { kind: SourceKind; attempt: number }

// ─── Event Map ────────────────────────────────────────────────────────────────

export interface IngestEventMap {
  SourceConnected:    SourceConnectedPayload;
  SourceDisconnected: SourceDisconnectedPayload;
  PlaybackStarted:    PlaybackStartedPayload;
  PlaybackPaused:     PlaybackPausedPayload;
  PlaybackStopped:    PlaybackStoppedPayload;
  FrameAvailable:     FrameAvailablePayload;
  FrameDropped:       FrameDroppedPayload;
  FrameSkipped:       FrameSkippedPayload;
  InferenceRequested: InferenceRequestedPayload;
  InferenceCompleted: InferenceCompletedPayload;
  ErrorOccurred:      ErrorOccurredPayload;
  StatusChanged:      StatusChangedPayload;
  Reconnecting:       ReconnectingPayload;
}

export type IngestEventName = keyof IngestEventMap;

type Listener<K extends IngestEventName> = (payload: IngestEventMap[K]) => void;

// ─── Event Bus Implementation ────────────────────────────────────────────────

export class IngestEventBus {
  private listeners = new Map<string, Set<Listener<IngestEventName>>>();

  on<K extends IngestEventName>(event: K, listener: Listener<K>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener as Listener<IngestEventName>);
    return () => this.off(event, listener);
  }

  off<K extends IngestEventName>(event: K, listener: Listener<K>): void {
    this.listeners.get(event)?.delete(listener as Listener<IngestEventName>);
  }

  emit<K extends IngestEventName>(event: K, payload: IngestEventMap[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const cb of set) {
      try {
        (cb as Listener<K>)(payload);
      } catch (err) {
        console.error(`[IngestEventBus] Unhandled error in "${event}" listener:`, err);
      }
    }
  }

  removeAllListeners(event?: IngestEventName): void {
    if (event) this.listeners.delete(event);
    else       this.listeners.clear();
  }

  listenerCount(event: IngestEventName): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}

/** Module-level singleton — import and use anywhere within the ingest pipeline. */
export const ingestBus = new IngestEventBus();

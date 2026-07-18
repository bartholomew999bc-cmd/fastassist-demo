/**
 * FAST-Assist Studio — Frame Buffer Queue
 *
 * Fixed-capacity circular buffer for processed frames.
 * When full, oldest frames are evicted before enqueuing the new one.
 * Frames older than maxAgeMs are transparently discarded on dequeue/peek.
 * All operations are O(1) and synchronous.
 */

import type { ProcessedFrame } from './IVideoSource';

export interface QueueDiagnostics {
  depth:               number;
  capacity:            number;
  droppedTotal:        number;
  processedTotal:      number;
  oldestAgeMs:         number | null;
  estimatedMemoryBytes: number;
}

export interface QueueOptions {
  /** Max frames to buffer simultaneously. Default: 8 */
  capacity?: number;
  /** Discard frames older than this on read. Default: 3000 ms */
  maxAgeMs?: number;
}

export class FrameQueue {
  private readonly capacity: number;
  private readonly maxAgeMs: number;

  private buffer:  (ProcessedFrame | null)[];
  private head:    number = 0;  // write pointer
  private tail:    number = 0;  // read pointer
  private size:    number = 0;
  private dropped: number = 0;
  private total:   number = 0;

  private pushListeners: Array<(frame: ProcessedFrame) => void> = [];

  constructor(options: QueueOptions = {}) {
    this.capacity = options.capacity ?? 8;
    this.maxAgeMs = options.maxAgeMs ?? 3000;
    this.buffer   = new Array<ProcessedFrame | null>(this.capacity).fill(null);
  }

  /**
   * Enqueue a processed frame. Evicts the oldest entry if at capacity.
   * Immediately notifies all push-based subscribers.
   */
  enqueue(frame: ProcessedFrame): void {
    this.total++;
    if (this.size === this.capacity) {
      // Overflow — drop oldest
      this.buffer[this.tail] = null;
      this.tail = (this.tail + 1) % this.capacity;
      this.size--;
      this.dropped++;
    }
    this.buffer[this.head] = frame;
    this.head = (this.head + 1) % this.capacity;
    this.size++;

    for (const cb of this.pushListeners) {
      try { cb(frame); } catch { /* isolate listener errors */ }
    }
  }

  /** Remove and return the oldest non-stale frame. Returns null if empty. */
  dequeue(): ProcessedFrame | null {
    this.evictStale();
    if (this.size === 0) return null;
    const frame = this.buffer[this.tail]!;
    this.buffer[this.tail] = null;
    this.tail = (this.tail + 1) % this.capacity;
    this.size--;
    return frame;
  }

  /** Inspect the oldest non-stale frame without removing it. */
  peek(): ProcessedFrame | null {
    this.evictStale();
    return this.size > 0 ? this.buffer[this.tail] : null;
  }

  /**
   * Subscribe to frames as they arrive (push model).
   * Returns an unsubscribe function.
   */
  subscribe(cb: (frame: ProcessedFrame) => void): () => void {
    this.pushListeners.push(cb);
    return () => { this.pushListeners = this.pushListeners.filter(l => l !== cb); };
  }

  clear(): void {
    this.buffer = new Array<ProcessedFrame | null>(this.capacity).fill(null);
    this.head   = 0;
    this.tail   = 0;
    this.size   = 0;
  }

  get length(): number { return this.size; }

  diagnostics(): QueueDiagnostics {
    const oldest = this.peek();
    let estMem   = 0;
    for (let i = 0; i < this.capacity; i++) {
      const f = this.buffer[i];
      if (f) estMem += f.byteSize;
    }
    return {
      depth:                this.size,
      capacity:             this.capacity,
      droppedTotal:         this.dropped,
      processedTotal:       this.total,
      oldestAgeMs:          oldest ? Date.now() - oldest.metadata.processingTimestamp : null,
      estimatedMemoryBytes: estMem,
    };
  }

  private evictStale(): void {
    const now = Date.now();
    while (this.size > 0) {
      const frame = this.buffer[this.tail];
      if (!frame) { this.tail = (this.tail + 1) % this.capacity; this.size--; this.dropped++; continue; }
      if (now - frame.metadata.processingTimestamp <= this.maxAgeMs) break;
      this.buffer[this.tail] = null;
      this.tail = (this.tail + 1) % this.capacity;
      this.size--;
      this.dropped++;
    }
  }
}

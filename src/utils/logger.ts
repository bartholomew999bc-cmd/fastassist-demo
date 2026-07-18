/**
 * FAST-Assist Studio — Logging Service
 *
 * Structured log collection with categories and levels.
 * Subscribers receive live log entries for any debug console.
 * No console spam in production mode.
 */

import { config } from '@/config';
import type { LogEntry, LogLevel } from '@/types';

type LogSubscriber = (entry: LogEntry) => void;

class Logger {
  private entries: LogEntry[] = [];
  private subscribers: Set<LogSubscriber> = new Set();
  private counter = 0;

  private emit(level: LogLevel, category: string, message: string, data?: unknown): void {
    const entry: LogEntry = {
      id:        `log-${++this.counter}`,
      timestamp: Date.now(),
      level,
      category,
      message,
      data,
    };

    // Maintain rolling window
    this.entries.push(entry);
    if (this.entries.length > config.maxLogEntries) {
      this.entries.shift();
    }

    // Notify subscribers (e.g. debug panel)
    this.subscribers.forEach(fn => fn(entry));

    // Console output — only in debug mode or for errors/warnings
    if (config.debug || level === 'error' || level === 'warn') {
      const prefix = `[FAST-Assist][${category}]`;
      if (level === 'error') console.error(prefix, message, data ?? '');
      else if (level === 'warn')  console.warn(prefix, message, data ?? '');
      else if (config.debug)      console.log(prefix, message, data ?? '');
    }
  }

  info(category: string, message: string, data?: unknown)  { this.emit('info',  category, message, data); }
  warn(category: string, message: string, data?: unknown)  { this.emit('warn',  category, message, data); }
  error(category: string, message: string, data?: unknown) { this.emit('error', category, message, data); }
  debug(category: string, message: string, data?: unknown) { this.emit('debug', category, message, data); }

  getEntries(): LogEntry[] { return [...this.entries]; }

  subscribe(fn: LogSubscriber): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }
}

export const logger = new Logger();

/**
 * FAST-Assist Studio — useClock Hook
 *
 * Provides a formatted current time string, updated every second.
 */

import { useState, useEffect } from 'react';

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour:   '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function useClock(): string {
  const [time, setTime] = useState(() => formatTime(new Date()));

  useEffect(() => {
    const id = setInterval(() => setTime(formatTime(new Date())), 1000);
    return () => clearInterval(id);
  }, []);

  return time;
}

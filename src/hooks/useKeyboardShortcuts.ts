/**
 * FAST-Assist Studio — Keyboard Shortcuts Hook
 *
 * Registers global keyboard shortcuts for accessibility and power-user control.
 */

import { useEffect } from 'react';
import { useAppStore } from '@/state/store';

export function useKeyboardShortcuts(): void {
  const { theme, setTheme, isFullscreen, setFullscreen } = useAppStore();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore when focus is inside an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case 'f':
        case 'F':
          // Toggle fullscreen
          if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
            setFullscreen(true);
          } else {
            document.exitFullscreen().catch(() => {});
            setFullscreen(false);
          }
          break;

        case 't':
        case 'T':
          // Toggle theme
          setTheme(theme === 'dark' ? 'light' : 'dark');
          break;

        case 'Escape':
          if (isFullscreen) {
            document.exitFullscreen().catch(() => {});
            setFullscreen(false);
          }
          break;

        default:
          break;
      }
    };

    window.addEventListener('keydown', handler);

    // Sync fullscreen state with browser events
    const onFullscreenChange = () => {
      setFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);

    return () => {
      window.removeEventListener('keydown', handler);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, [theme, isFullscreen, setTheme, setFullscreen]);
}

import { useEffect } from 'react';

/** Screen Wake Lock exists (secure context; iOS Home Screen apps from 18.4). */
export function wakeLockSupported(): boolean {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
}

/**
 * Keeps the screen on while `enabled`. The browser drops the lock whenever the page is hidden,
 * so it is requested again on visibilitychange. A refused request is ignored.
 */
export function useWakeLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || !wakeLockSupported()) return;
    let sentinel: WakeLockSentinel | null = null;
    let active = true;
    let requesting = false;

    const acquire = async () => {
      if (requesting || document.visibilityState !== 'visible' || (sentinel && !sentinel.released)) return;
      requesting = true;
      try {
        const next = await navigator.wakeLock.request('screen');
        if (active) sentinel = next;
        else void next.release();
      } catch {
        // Refused (low battery, power saver, not allowed): the screen simply dims as usual.
      } finally {
        requesting = false;
      }
    };
    const onVisibility = () => void acquire();

    void acquire();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisibility);
      void sentinel?.release().catch(() => undefined);
    };
  }, [enabled]);
}

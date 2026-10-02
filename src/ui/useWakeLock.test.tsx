// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWakeLock, wakeLockSupported } from './useWakeLock';

interface FakeSentinel {
  released: boolean;
  release: () => Promise<void>;
}

/** Installs a fake navigator.wakeLock; each request returns a new sentinel. */
function fakeWakeLock(request?: () => Promise<FakeSentinel>) {
  const sentinels: FakeSentinel[] = [];
  const impl = vi.fn(
    request ??
      (async () => {
        const sentinel: FakeSentinel = {
          released: false,
          release: vi.fn(async () => {
            sentinel.released = true;
          }),
        };
        sentinels.push(sentinel);
        return sentinel;
      }),
  );
  Object.defineProperty(navigator, 'wakeLock', { value: { request: impl }, configurable: true });
  return { request: impl, sentinels };
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'wakeLock');
  Reflect.deleteProperty(document, 'visibilityState');
});

describe('useWakeLock', () => {
  it('reports support from navigator.wakeLock', () => {
    expect(wakeLockSupported()).toBe(false);
    fakeWakeLock();
    expect(wakeLockSupported()).toBe(true);
  });

  it('does nothing while disabled', () => {
    const { request } = fakeWakeLock();
    renderHook(() => useWakeLock(false));
    expect(request).not.toHaveBeenCalled();
  });

  it('holds the screen lock while enabled and releases it when turned off', async () => {
    const { request, sentinels } = fakeWakeLock();
    const { rerender } = renderHook(({ on }) => useWakeLock(on), { initialProps: { on: true } });
    await waitFor(() => expect(request).toHaveBeenCalledWith('screen'));
    rerender({ on: false });
    await waitFor(() => expect(sentinels[0]?.released).toBe(true));
  });

  it('asks again when the page becomes visible after the browser dropped the lock', async () => {
    const { request, sentinels } = fakeWakeLock();
    renderHook(() => useWakeLock(true));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    // The browser releases the lock itself when the page is hidden.
    sentinels[0]!.released = true;
    act(() => setVisibility('hidden'));
    expect(request).toHaveBeenCalledTimes(1);
    act(() => setVisibility('visible'));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  });

  it('ignores a refused lock (for example on low battery)', async () => {
    const { request } = fakeWakeLock(() => Promise.reject(new DOMException('denied', 'NotAllowedError')));
    renderHook(() => useWakeLock(true));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  });
});

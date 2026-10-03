import { vi } from 'vitest';

/** Makes useIsPhone report a phone or a wide screen. Undo with vi.unstubAllGlobals(). */
export function mockViewport(phone: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: phone && query.includes('max-width'),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

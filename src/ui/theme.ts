export type ThemePref = 'system' | 'light' | 'dark';

const KEY = 'cartcraft-theme';
const THEME_COLOR = { light: '#faf7f2', dark: '#0c0a09' } as const;

/** Kept in localStorage, not the database: it must apply before the first paint, and it is per device. */
export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

function systemQuery(): MediaQueryList | undefined {
  return typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : undefined;
}

export function applyTheme(pref: ThemePref): void {
  const resolved = pref === 'system' ? (systemQuery()?.matches ? 'dark' : 'light') : pref;
  document.documentElement.dataset.theme = resolved;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[resolved]);
}

export function setThemePref(pref: ThemePref): void {
  try {
    if (pref === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    // Private mode or blocked storage: the choice still applies until the page closes.
  }
  applyTheme(pref);
}

/** Applies the saved choice and follows the device setting while the choice is "system". */
export function initTheme(): void {
  applyTheme(getThemePref());
  systemQuery()?.addEventListener('change', () => {
    if (getThemePref() === 'system') applyTheme('system');
  });
}

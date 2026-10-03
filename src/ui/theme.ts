export type ThemePref = 'system' | 'light' | 'dark';
export type Palette = 'basil' | 'tomato' | 'blueberry' | 'saffron' | 'plum' | 'paper';

export const PALETTES: readonly { id: Palette; label: string }[] = [
  { id: 'basil', label: 'Basil' },
  { id: 'tomato', label: 'Tomato' },
  { id: 'blueberry', label: 'Blueberry' },
  { id: 'saffron', label: 'Saffron' },
  { id: 'plum', label: 'Plum' },
  { id: 'paper', label: 'Paper' },
];

const KEY = 'cartcraft-theme';
const PALETTE_KEY = 'cartcraft-palette';

/** Page colours for the browser's address bar; they match --color-slate-50 in index.css. */
const THEME_COLOR: Record<Palette, { light: string; dark: string }> = {
  basil: { light: '#faf7f2', dark: '#0c0a09' },
  tomato: { light: '#fdf3f0', dark: '#140b0a' },
  blueberry: { light: '#f3f4fb', dark: '#0b0d16' },
  saffron: { light: '#fcf6e8', dark: '#120e06' },
  plum: { light: '#f8f2f8', dark: '#120a12' },
  paper: { light: '#f4efe4', dark: '#16130f' },
};

/** Only set when storage is blocked, so the choice still lasts until the page closes. */
let fallbackPalette: Palette | null = null;

/** Kept in localStorage, not the database: it must apply before the first paint, and it is per device. */
export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function getPalette(): Palette {
  try {
    const v = localStorage.getItem(PALETTE_KEY);
    return PALETTES.some((p) => p.id === v) ? (v as Palette) : 'basil';
  } catch {
    return fallbackPalette ?? 'basil';
  }
}

function systemQuery(): MediaQueryList | undefined {
  return typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : undefined;
}

export function applyTheme(pref: ThemePref): void {
  const resolved = pref === 'system' ? (systemQuery()?.matches ? 'dark' : 'light') : pref;
  const palette = getPalette();
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.palette = palette;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[palette][resolved]);
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

export function setPalette(palette: Palette): void {
  try {
    if (palette === 'basil') localStorage.removeItem(PALETTE_KEY);
    else localStorage.setItem(PALETTE_KEY, palette);
    fallbackPalette = null;
  } catch {
    fallbackPalette = palette;
  }
  applyTheme(getThemePref());
}

/** Applies the saved choice and follows the device setting while the choice is "system". */
export function initTheme(): void {
  applyTheme(getThemePref());
  systemQuery()?.addEventListener('change', () => {
    if (getThemePref() === 'system') applyTheme('system');
  });
}

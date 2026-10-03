// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { applyTheme, getPalette, getThemePref, setPalette, setThemePref } from './theme';

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.palette;
  document.querySelector('meta[name="theme-color"]')?.remove();
});

describe('theme', () => {
  it('defaults to following the device', () => {
    expect(getThemePref()).toBe('system');
  });

  it('remembers an explicit choice and applies it to the page', () => {
    setThemePref('dark');
    expect(getThemePref()).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    setThemePref('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('going back to the device setting clears the stored choice', () => {
    setThemePref('dark');
    setThemePref('system');
    expect(getThemePref()).toBe('system');
    expect(localStorage.getItem('cartcraft-theme')).toBeNull();
  });

  it('resolves "system" to light when the device gives no preference', () => {
    applyTheme('system');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('applies the saved palette with the mode, and picks the matching browser colour', () => {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.append(meta);
    setPalette('tomato');
    setThemePref('dark');
    expect(document.documentElement.dataset.palette).toBe('tomato');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#140b0a');
  });

  it('defaults to basil and forgets an unknown palette', () => {
    localStorage.setItem('cartcraft-palette', 'neon');
    expect(getPalette()).toBe('basil');
  });
});

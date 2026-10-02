// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { applyTheme, getThemePref, setThemePref } from './theme';

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
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
});

import { describe, expect, it } from 'vitest';
import { aiSummary, aisleSummary, pantrySummary } from './summaries';

describe('settings summaries', () => {
  it('lists up to three pantry staples, then a count', () => {
    expect(pantrySummary([])).toBe('None yet');
    expect(pantrySummary(['salt', 'water'])).toBe('salt, water');
    expect(pantrySummary(['a', 'b', 'c'])).toBe('a, b, c');
    expect(pantrySummary(['a', 'b', 'c', 'd', 'e'])).toBe('a, b, c +2');
  });

  it('counts aisles', () => {
    expect(aisleSummary(1)).toBe('1 aisle, your store order');
    expect(aisleSummary(11)).toBe('11 aisles, your store order');
  });

  it('describes the AI key state', () => {
    expect(aiSummary(undefined, 'DeepSeek')).toBe('Off');
    expect(aiSummary({ savedFor: null, usableKey: null }, 'DeepSeek')).toBe('Off');
    expect(aiSummary({ savedFor: 'deepseek', usableKey: 'sk' }, 'DeepSeek')).toBe('DeepSeek, key saved');
    expect(aiSummary({ savedFor: 'deepseek', usableKey: null }, 'OpenAI')).toBe('OpenAI, no key');
  });
});

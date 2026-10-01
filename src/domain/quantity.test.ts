import { describe, expect, it } from 'vitest';
import { parseLeadingAmount, toNumber } from './quantity';

describe('toNumber', () => {
  it.each([
    ['1 1/2', 1.5], ['1 and 1/2', 1.5], ['1/2', 0.5], ['1.5', 1.5], ['1,5', 1.5], ['1,000', 1000], ['2', 2],
  ])('%s -> %d', (token, n) => {
    expect(toNumber(token)).toBe(n);
  });

  it('does not round thirds', () => {
    expect(toNumber('1/3')).toBeCloseTo(1 / 3, 10);
  });

  it('returns undefined for non-numbers', () => {
    expect(toNumber('abc')).toBeUndefined();
  });
});

describe('parseLeadingAmount', () => {
  it.each([
    ['2 cups flour', { min: 2 }, 'cups flour'],
    ['2-3 cloves', { min: 2, max: 3 }, 'cloves'],
    ['2 to 3 tbsp oil', { min: 2, max: 3 }, 'tbsp oil'],
    ['1 or 2 jalapeños', { min: 1, max: 2 }, 'jalapeños'],
    ['2 oranges', { min: 2 }, 'oranges'],
    ['2 tomatoes', { min: 2 }, 'tomatoes'],
    ['2 14-ounce cans', { min: 2 }, '14-ounce cans'],
  ])('%s', (text, quantity, rest) => {
    expect(parseLeadingAmount(text)).toEqual({ quantity, rest });
  });

  it('returns the text unchanged without a leading number', () => {
    expect(parseLeadingAmount('salt to taste')).toEqual({ rest: 'salt to taste' });
  });
});

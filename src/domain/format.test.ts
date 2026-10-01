import { describe, expect, it } from 'vitest';
import { formatAmount, formatAmounts, formatFraction } from './format';

describe('formatFraction', () => {
  it.each([
    [1.5, '1 1/2'],
    [1 / 3, '1/3'],
    [2, '2'],
    [0.999, '1'],
    [0.75, '3/4'],
    [2.66, '2 2/3'],
    [0.01, '0'],
  ])('%d -> %s', (n, expected) => {
    expect(formatFraction(n)).toBe(expected);
  });
});

describe('formatAmount (us)', () => {
  it.each([
    [{ quantity: { min: 354.882 }, unit: 'ml' }, '1 1/2 cups'],
    [{ quantity: { min: 88.72 }, unit: 'ml' }, '6 tbsp'],
    [{ quantity: { min: 0.75 }, unit: 'tsp' }, '3/4 tsp'],
    [{ quantity: { min: 1 / 32 }, unit: 'tsp' }, 'pinch'],
    [{ quantity: { min: 1 }, unit: 'cup' }, '1 cup'],
    [{ quantity: { min: 340.194 }, unit: 'g' }, '12 oz'],
    [{ quantity: { min: 907.184 }, unit: 'g' }, '2 lb'],
    [{ quantity: { min: 4.5 } }, '5'],
    [{ quantity: { min: 3, max: 4 }, unit: 'clove' }, '3-4 cloves'],
    [{ quantity: { min: 0.5 }, unit: 'can', packageSize: { quantity: 14, unit: 'oz' } }, '1 can (14 oz)'],
    [{ quantity: { min: 1 }, unit: 'pinch' }, '1 pinch'],
    [{ quantity: { min: 1 }, unit: 'can', packageSize: { quantity: 28, unit: 'oz' } }, '1 can (28 oz)'],
    [{ quantity: { min: 16 }, unit: 'tbsp' }, '1 cup'],
    [{ quantity: { min: 236.5888 }, unit: 'ml' }, '1 cup'],
    [{ quantity: { min: 0.5 }, unit: 'cup' }, '1/2 cup'],
    [{ quantity: { min: 0.75 }, unit: 'cup' }, '3/4 cup'],
    [{ quantity: { min: 1 / 3 }, unit: 'cup' }, '1/3 cup'],
    [{ quantity: { min: 2 / 3 }, unit: 'cup' }, '2/3 cup'],
    [{ quantity: { min: 0.25 }, unit: 'cup' }, '1/4 cup'],
    [{ quantity: { min: 3 }, unit: 'tbsp' }, '3 tbsp'],
    [{ quantity: { min: 6 }, unit: 'tbsp' }, '6 tbsp'],
    [{ quantity: { min: 0.125 }, unit: 'cup' }, '2 tbsp'],
  ])('%j -> %s', (amount, expected) => {
    expect(formatAmount(amount, 'us')).toBe(expected);
  });
});

describe('formatAmount (metric)', () => {
  it.each([
    [{ quantity: { min: 1250 }, unit: 'g' }, '1.25 kg'],
    [{ quantity: { min: 340.194 }, unit: 'g' }, '340 g'],
    [{ quantity: { min: 1 }, unit: 'cup' }, '237 ml'],
    [{ quantity: { min: 1500 }, unit: 'ml' }, '1.5 L'],
    [{ quantity: { min: 12 }, unit: 'oz' }, '340 g'],
    [{ quantity: { min: 1 }, unit: 'can', packageSize: { quantity: 400, unit: 'g' } }, '1 can (400 g)'],
    [{ quantity: { min: 1 }, unit: 'can', packageSize: { quantity: 14, unit: 'oz' } }, '1 can (397 g)'],
  ])('%j -> %s', (amount, expected) => {
    expect(formatAmount(amount, 'metric')).toBe(expected);
  });
});

describe('formatAmounts', () => {
  it('joins incompatible amounts with +', () => {
    expect(
      formatAmounts([{ quantity: { min: 2 }, unit: 'clove' }, { quantity: { min: 1 }, unit: 'tbsp' }], 'us'),
    ).toBe('2 cloves + 1 tbsp');
  });

  it('returns an empty string for no amounts', () => {
    expect(formatAmounts([], 'us')).toBe('');
  });
});

describe('zero amounts', () => {
  it('render as nothing instead of "pinch"', () => {
    expect(formatAmount({ quantity: { min: 0 }, unit: 'cup' }, 'us')).toBe('');
    expect(formatAmount({ quantity: { min: 0 }, unit: 'clove' }, 'us')).toBe('');
    expect(formatAmounts([{ quantity: { min: 0 }, unit: 'cup' }, { quantity: { min: 2 }, unit: 'clove' }], 'us')).toBe('2 cloves');
  });
});

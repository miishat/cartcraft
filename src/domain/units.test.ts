import { describe, expect, it } from 'vitest';
import { dimensionOf, isPackagedUnit, lookupUnit, toBaseUnits, unitLabel } from './units';

describe('lookupUnit', () => {
  it.each([
    ['T', 'tbsp'], ['t', 'tsp'], ['Tbsp.', 'tbsp'], ['TBSP', 'tbsp'], ['teaspoons', 'tsp'],
    ['cups', 'cup'], ['fl oz', 'fl oz'], ['ounces', 'oz'], ['lbs', 'lb'], ['Grams', 'g'],
    ['cloves', 'clove'], ['tins', 'can'],
  ])('%s -> %s', (token, id) => {
    expect(lookupUnit(token)?.id).toBe(id);
  });

  it.each(['large', 'medium', 'flour', ''])('%s is not a unit', (token) => {
    expect(lookupUnit(token)).toBeUndefined();
  });
});

describe('unit helpers', () => {
  it('knows dimensions', () => {
    expect(dimensionOf('cup')).toBe('volume');
    expect(dimensionOf('oz')).toBe('mass');
    expect(dimensionOf('fl oz')).toBe('volume');
    expect(dimensionOf(undefined)).toBe('count');
    expect(dimensionOf('clove')).toBe('other');
  });

  it('converts to base units', () => {
    expect(toBaseUnits(1, 'cup')).toBeCloseTo(236.588, 3);
    expect(toBaseUnits(1, 'lb')).toBeCloseTo(453.592, 3);
    expect(toBaseUnits(3, 'clove')).toBe(3);
  });

  it('labels singular and plural', () => {
    expect(unitLabel('cup', 1)).toBe('cup');
    expect(unitLabel('cup', 1.5)).toBe('cups');
    expect(unitLabel('tbsp', 6)).toBe('tbsp');
  });

  it('knows packaged units', () => {
    expect(isPackagedUnit('can')).toBe(true);
    expect(isPackagedUnit('clove')).toBe(false);
  });
});

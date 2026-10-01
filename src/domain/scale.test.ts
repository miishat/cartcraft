import { describe, expect, it } from 'vitest';
import { parseIngredientLine } from './parse';
import { scaleLine } from './scale';

const scaled = (raw: string, base: number, target: number) =>
  scaleLine(parseIngredientLine(raw, 'id'), base, target);

describe('scaleLine', () => {
  it('returns the line unchanged for a non-positive target', () => {
    const line = parseIngredientLine('1 cup milk', 'id');
    expect(scaleLine(line, 4, 0)).toBe(line);
    expect(scaleLine(line, 4, -2)).toBe(line);
    expect(scaleLine(line, 4, Number.NaN)).toBe(line);
  });

  it('multiplies the quantity by target / base', () => {
    expect(scaled('1 cup milk', 4, 6).quantity).toEqual({ min: 1.5 });
  });

  it('scales both ends of a range', () => {
    expect(scaled('2-3 cloves garlic', 2, 4).quantity).toEqual({ min: 4, max: 6 });
  });

  it('never scales the package size', () => {
    const line = scaled('1 (14 oz) can beans', 4, 2);
    expect(line.quantity).toEqual({ min: 0.5 });
    expect(line.packageSize).toEqual({ quantity: 14, unit: 'oz' });
  });

  it('never scales numbers inside notes', () => {
    const line = scaled('1 lb beef, cut into 1-inch cubes', 4, 8);
    expect(line.quantity).toEqual({ min: 2 });
    expect(line.notes).toBe('cut into 1-inch cubes');
  });

  it('leaves a pinch alone', () => {
    expect(scaled('a pinch of salt', 4, 8).quantity).toEqual({ min: 1 });
  });

  it('leaves to-taste lines alone', () => {
    expect(scaled('Salt, to taste', 4, 8).quantity).toBeUndefined();
  });

  it('returns the line unchanged when base servings is not positive', () => {
    expect(scaled('1 cup milk', 0, 6).quantity).toEqual({ min: 1 });
  });
});

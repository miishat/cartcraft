import { describe, expect, it } from 'vitest';
import { DEFAULT_COVER_EMOJI, recipeCover } from './recipeCover';
import { RECIPE_TINTS } from './tints';

const emoji = (title: string) => recipeCover({ id: 'r1', title }).emoji;

describe('recipeCover', () => {
  it('picks an emoji from words in the title', () => {
    expect(emoji('Lemon ricotta pasta')).toBe('🍝');
    expect(emoji('Black bean tacos')).toBe('🌮');
    expect(emoji('Buttermilk pancakes')).toBe('🥞');
    expect(emoji('Miso glazed salmon')).toBe('🐟');
  });

  it('prefers the dish over its main ingredient', () => {
    expect(emoji('Chicken tikka masala')).toBe('🍛');
    expect(emoji('Chicken noodle soup')).toBe('🍜');
  });

  it('matches whole words only', () => {
    expect(emoji('Ricotta toast')).toBe('🍞');
    expect(emoji('Eggplant parmesan')).toBe('🍆');
  });

  it('ignores case', () => {
    expect(emoji('SPAGHETTI')).toBe('🍝');
  });

  it('uses a plate when nothing matches', () => {
    expect(emoji("Grandma's Sunday special")).toBe(DEFAULT_COVER_EMOJI);
  });

  it('gives a recipe the same non-grey tint every time', () => {
    const a = recipeCover({ id: 'abc-123', title: 'X' }).tint;
    expect(recipeCover({ id: 'abc-123', title: 'Renamed' }).tint).toBe(a);
    expect(RECIPE_TINTS).toContain(a);
  });

  it('spreads tints across recipes', () => {
    const tints = new Set(Array.from({ length: 30 }, (_, i) => recipeCover({ id: `id-${i}`, title: 'X' }).tint));
    expect(tints.size).toBeGreaterThan(3);
  });
});

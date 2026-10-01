import { describe, expect, it } from 'vitest';
import { decodeEntities, normalizeText } from './text';

describe('decodeEntities', () => {
  it.each([
    ['&amp;frac12;', '½'],
    ['Mac &amp;amp; Cheese', 'Mac & Cheese'],
    ['&#189; cup', '½ cup'],
    ['&#xBD; cup', '½ cup'],
    ['&unknown; stays', '&unknown; stays'],
  ])('%s -> %s', (input, expected) => {
    expect(decodeEntities(input)).toBe(expected);
  });
});

describe('normalizeText', () => {
  it.each([
    ['1½ cups flour', '1 1/2 cups flour'],
    ['½-¾ cup sugar', '1/2-3/4 cup sugar'],
    ['1/2&nbsp;cup cream', '1/2 cup cream'],
    ['- 2 cups sugar', '2 cups sugar'],
    ['• 1 egg', '1 egg'],
    ['flour*', 'flour'],
    ['  2   eggs  ', '2 eggs'],
    ['2–3 cloves', '2-3 cloves'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeText(input)).toBe(expected);
  });
});

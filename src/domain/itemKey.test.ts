import { describe, expect, it } from 'vitest';
import { itemKey } from './itemKey';

describe('itemKey', () => {
  it.each([
    ['Eggs', 'egg'],
    ['bay leaves', 'bay leaf'],
    ['red onion', 'red onion'],
    ['fresh basil', 'basil'],
    ['minced garlic', 'garlic'],
    ['diced tomatoes', 'diced tomato'],
    ['Scallions', 'green onion'],
    ["confectioners' sugar", 'powdered sugar'],
    ['molasses', 'molasses'],
    ['jalapeños', 'jalapeño'],
    ['', ''],
  ])('%s -> %s', (item, key) => {
    expect(itemKey(item)).toBe(key);
  });
});

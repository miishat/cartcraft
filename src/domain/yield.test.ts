import { describe, expect, it } from 'vitest';
import { parseYield } from './yield';

describe('parseYield', () => {
  it.each([
    ['4', { servings: 4 }],
    [4, { servings: 4 }],
    ['Serves 4-6', { servings: 4, yieldText: 'Serves 4-6' }],
    ['4 servings', { servings: 4, yieldText: '4 servings' }],
    [['4', '4 servings'], { servings: 4 }],
    [['6', '24 cookies'], { servings: 6, yieldText: '24 cookies' }],
    ['24 cookies', { yieldText: '24 cookies' }],
    [undefined, {}],
    ['', {}],
    [0, {}],
    [{ value: 4 }, {}],
  ])('%j -> %j', (input, expected) => {
    expect(parseYield(input)).toEqual(expected);
  });
});

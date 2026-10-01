import { describe, expect, it } from 'vitest';
import { AISLE_DICTIONARY, DEFAULT_AISLES, classifyAisle } from './aisles';
import { parseIngredientLine } from './parse';

const none = new Map<string, string>();

describe('classifyAisle', () => {
  it.each([
    ['onion', 'produce'],
    ['red onion', 'produce'],
    ['egg', 'dairy-eggs'],
    ['smoked paprika', 'spices-oils'],
    ['garlic powder', 'spices-oils'],
    ['boneless chicken thigh', 'meat-seafood'],
    ['chicken broth', 'canned'],
    ['olive oil', 'spices-oils'],
    ['diced tomato', 'canned'],
    ['tomato', 'produce'],
    ['dragon fruit leather', 'other'],
    ['', 'other'],
  ])('%s -> %s', (key, aisle) => {
    expect(classifyAisle(key, none)).toBe(aisle);
  });

  it('prefers an override', () => {
    expect(classifyAisle('onion', new Map([['onion', 'frozen']]))).toBe('frozen');
  });

  it('every dictionary aisle is a default aisle', () => {
    const ids = new Set(DEFAULT_AISLES.map((a) => a.id));
    for (const aisle of Object.values(AISLE_DICTIONARY)) expect(ids.has(aisle)).toBe(true);
  });

  it('has a useful starter dictionary', () => {
    expect(Object.keys(AISLE_DICTIONARY).length).toBeGreaterThan(250);
  });
});

describe('canned vs fresh', () => {
  it('keeps canned diced tomatoes out of produce', () => {
    const canned = parseIngredientLine('1 (14 oz) can diced tomatoes', 'a');
    const fresh = parseIngredientLine('2 tomatoes, diced', 'b');
    expect(classifyAisle(canned.itemKey, none)).toBe('canned');
    expect(classifyAisle(fresh.itemKey, none)).toBe('produce');
  });
});

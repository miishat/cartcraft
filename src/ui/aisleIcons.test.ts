import { Archive, Carrot, ShoppingBasket } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { DEFAULT_AISLES } from '../domain';
import { PANTRY_CHECK_ID, aisleIcon, aisleTint } from './aisleIcons';
import { TINT_CLASS } from './tints';

describe('aisle icons and tints', () => {
  it('gives known aisles their own icon and tint', () => {
    expect(aisleIcon('produce')).toBe(Carrot);
    expect(aisleTint('produce')).toBe('green');
    expect(aisleTint('meat-seafood')).toBe('red');
  });

  it('gives the pantry check section an archive icon', () => {
    expect(aisleIcon(PANTRY_CHECK_ID)).toBe(Archive);
    expect(aisleTint(PANTRY_CHECK_ID)).toBe('gray');
  });

  it('falls back to a grey basket for Other and unknown aisles', () => {
    expect(aisleIcon('other')).toBe(ShoppingBasket);
    expect(aisleIcon('my-custom-aisle')).toBe(ShoppingBasket);
    expect(aisleTint('my-custom-aisle')).toBe('gray');
  });

  it('has a tint class for every default aisle', () => {
    for (const aisle of DEFAULT_AISLES) expect(TINT_CLASS[aisleTint(aisle.id)]).toMatch(/^bg-tint-/);
  });
});

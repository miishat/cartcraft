import { describe, expect, it } from 'vitest';
import { DEFAULT_AISLES } from '../domain';
import { PANTRY_CHECK_ID, aisleEmoji, aisleTint } from './aisleIcons';
import { TINT_CLASS } from './tints';

describe('aisle emoji and tints', () => {
  it('gives known aisles their own emoji and tint', () => {
    expect(aisleEmoji('produce')).toBe('🥕');
    expect(aisleEmoji('meat-seafood')).toBe('🥩');
    expect(aisleEmoji('dairy-eggs')).toBe('🥛');
    expect(aisleTint('produce')).toBe('green');
    expect(aisleTint('meat-seafood')).toBe('red');
  });

  it('gives the pantry check section a jar', () => {
    expect(aisleEmoji(PANTRY_CHECK_ID)).toBe('🫙');
    expect(aisleTint(PANTRY_CHECK_ID)).toBe('gray');
  });

  it('falls back to a grey cart for Other and unknown aisles', () => {
    expect(aisleEmoji('other')).toBe('🛒');
    expect(aisleEmoji('my-custom-aisle')).toBe('🛒');
    expect(aisleTint('my-custom-aisle')).toBe('gray');
  });

  it('has an emoji and a tint class for every default aisle', () => {
    for (const aisle of DEFAULT_AISLES) {
      expect(aisleEmoji(aisle.id)).not.toBe('');
      expect(TINT_CLASS[aisleTint(aisle.id)]).toMatch(/^bg-tint-/);
    }
  });
});

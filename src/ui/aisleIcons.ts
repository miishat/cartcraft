import type { Tint } from './tints';

/** Section id for the "Check pantry" group. Not a real aisle, so it cannot clash with one. */
export const PANTRY_CHECK_ID = 'check-pantry';

const BY_AISLE: Record<string, { emoji: string; tint: Tint }> = {
  produce: { emoji: '🥕', tint: 'green' },
  'meat-seafood': { emoji: '🥩', tint: 'red' },
  'dairy-eggs': { emoji: '🥛', tint: 'blue' },
  bakery: { emoji: '🥐', tint: 'amber' },
  pantry: { emoji: '🌾', tint: 'orange' },
  canned: { emoji: '🥫', tint: 'teal' },
  'spices-oils': { emoji: '🫒', tint: 'rose' },
  frozen: { emoji: '🧊', tint: 'sky' },
  beverages: { emoji: '🥤', tint: 'purple' },
  household: { emoji: '🧻', tint: 'gray' },
  [PANTRY_CHECK_ID]: { emoji: '🫙', tint: 'gray' },
};

/** Emoji for an aisle id. Other and any aisle id this app does not know get a cart. */
export function aisleEmoji(aisleId: string): string {
  return BY_AISLE[aisleId]?.emoji ?? '🛒';
}

/** Badge tint for an aisle id. Other and unknown aisles are grey. */
export function aisleTint(aisleId: string): Tint {
  return BY_AISLE[aisleId]?.tint ?? 'gray';
}

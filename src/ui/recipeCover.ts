import { RECIPE_TINTS, type Tint } from './tints';

export const DEFAULT_COVER_EMOJI = '🍽️';

/**
 * First match wins, so dishes come before ingredients ("chicken tikka masala" is a curry,
 * "chicken noodle soup" is noodles). Words match whole, with an optional plural "s" or "es".
 */
const COVERS: [string, string[]][] = [
  ['🍛', ['curry', 'masala', 'tikka', 'korma', 'dal', 'dhal']],
  ['🍝', ['pasta', 'spaghetti', 'lasagna', 'lasagne', 'penne', 'linguine', 'fettuccine', 'carbonara', 'macaroni', 'gnocchi']],
  ['🍜', ['ramen', 'noodle', 'pho', 'udon', 'soba', 'pad thai']],
  ['🍲', ['soup', 'stew', 'chili', 'chowder', 'broth']],
  ['🥗', ['salad', 'slaw']],
  ['🌮', ['taco', 'burrito', 'quesadilla', 'enchilada', 'fajita']],
  ['🍕', ['pizza', 'flatbread']],
  ['🍔', ['burger']],
  ['🥪', ['sandwich', 'wrap', 'panini']],
  ['🥞', ['pancake', 'waffle', 'crepe']],
  ['🍆', ['eggplant', 'aubergine']],
  ['🍳', ['egg', 'omelet', 'omelette', 'frittata', 'shakshuka', 'quiche']],
  ['🍚', ['rice', 'risotto', 'paella', 'pilaf', 'biryani']],
  ['🐟', ['salmon', 'fish', 'cod', 'tuna', 'trout', 'halibut']],
  ['🍤', ['shrimp', 'prawn']],
  ['🍗', ['chicken', 'turkey']],
  ['🥩', ['steak', 'beef', 'pork', 'lamb']],
  ['🍰', ['cake', 'cheesecake']],
  ['🍪', ['cookie', 'brownie']],
  ['🥧', ['pie', 'tart']],
  ['🍞', ['bread', 'loaf', 'toast', 'focaccia']],
  ['🥤', ['smoothie']],
];

const MATCHERS = COVERS.map(([emoji, words]) => [emoji, new RegExp(`\\b(${words.join('|')})(e?s)?\\b`, 'i')] as const);

/** Stable string hash, so a recipe keeps its tint across renders, renames and devices. */
function hash(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/** Cover for a recipe without a photo: an emoji from the title and a tint from the id. */
export function recipeCover(recipe: { id: string; title: string }): { emoji: string; tint: Tint } {
  const emoji = MATCHERS.find(([, re]) => re.test(recipe.title))?.[0] ?? DEFAULT_COVER_EMOJI;
  return { emoji, tint: RECIPE_TINTS[hash(recipe.id) % RECIPE_TINTS.length]! };
}

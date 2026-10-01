import pluralize from 'pluralize';

for (const word of ['molasses', 'hummus', 'couscous', 'asparagus', 'swiss', 'grits', 'greens']) {
  pluralize.addUncountableRule(word);
}

/**
 * Leading size, freshness and prep words that never change what you buy.
 * Color and variety words ("red onion", "ground beef") are kept, and so are "diced" and
 * "crushed" because they name canned products ("diced tomatoes").
 */
const DESCRIPTORS = new Set([
  'fresh', 'freshly', 'ripe', 'whole', 'small', 'medium', 'large',
  'minced', 'chopped', 'sliced', 'grated', 'shredded', 'peeled',
  'softened', 'melted', 'finely', 'thinly', 'roughly', 'coarsely',
]);

const ALIASES: Record<string, string> = {
  scallion: 'green onion',
  'spring onion': 'green onion',
  'garbanzo bean': 'chickpea',
  'coriander leaf': 'cilantro',
  'confectioners sugar': 'powdered sugar',
  'icing sugar': 'powdered sugar',
  'caster sugar': 'superfine sugar',
  aubergine: 'eggplant',
  courgette: 'zucchini',
  capsicum: 'bell pepper',
  'plain flour': 'all-purpose flour',
  'all purpose flour': 'all-purpose flour',
  'ap flour': 'all-purpose flour',
  'heavy whipping cream': 'heavy cream',
};

/** Normalized merge identity: lowercase, no leading descriptors, singular last word, aliases applied. No fuzzy matching. */
export function itemKey(item: string): string {
  const cleaned = item
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/[^a-z0-9ñéèáíóúü\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = cleaned.split(' ').filter(Boolean);
  while (words.length > 1 && DESCRIPTORS.has(words[0] ?? '')) words.shift();
  const last = words.pop();
  if (last === undefined) return '';
  words.push(pluralize.singular(last));
  const key = words.join(' ');
  return ALIASES[key] ?? key;
}

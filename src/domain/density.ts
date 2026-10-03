/**
 * Approximate grams per mL for ingredients that are measured by spoon or cup but weighed in metric
 * kitchens. Values come from standard cup weights (King Arthur, USDA) divided by 236.6 mL.
 * Keys are lowercase; a key with a space matches as a phrase, a single word matches a whole word
 * (plural allowed). To support a new ingredient, add a line here.
 */
export const SOLID_DENSITY: Record<string, number> = {
  // Fats
  butter: 0.96, margarine: 0.96, ghee: 0.91, shortening: 0.86, lard: 0.92, 'coconut oil': 0.92,
  'peanut butter': 1.08, 'almond butter': 1.0, tahini: 1.0, 'tomato paste': 1.08, 'cream cheese': 1.0, ricotta: 1.05,
  // Sugars and syrups
  sugar: 0.85, 'brown sugar': 0.9, 'powdered sugar': 0.51, 'icing sugar': 0.51, 'confectioners sugar': 0.51,
  honey: 1.42, 'maple syrup': 1.33, molasses: 1.4, jam: 1.3,
  // Flours, starches and baking
  flour: 0.52, 'bread flour': 0.54, 'almond flour': 0.4, 'rice flour': 0.65, cornstarch: 0.54, cornmeal: 0.64,
  semolina: 0.7, cocoa: 0.42, 'cocoa powder': 0.42, 'baking powder': 0.95, 'baking soda': 0.95, yeast: 0.6,
  breadcrumbs: 0.45, panko: 0.25, 'chocolate chips': 0.72,
  // Grains, legumes, dried fruit, nuts, seeds
  rice: 0.8, quinoa: 0.72, couscous: 0.65, lentils: 0.8, oats: 0.38, oat: 0.38, raisins: 0.63, cranberries: 0.5,
  walnuts: 0.49, almonds: 0.59, pecans: 0.46, peanuts: 0.62, cashews: 0.58, nuts: 0.55,
  coconut: 0.34, 'sesame seeds': 0.6, 'chia seeds': 0.6, flaxseed: 0.6, 'sunflower seeds': 0.6,
  // Cheese
  cheese: 0.47, parmesan: 0.42, cheddar: 0.48, mozzarella: 0.47, feta: 0.63, 'goat cheese': 0.9,
  // Fresh herbs and leaves
  parsley: 0.25, cilantro: 0.25, coriander: 0.25, basil: 0.25, mint: 0.25, dill: 0.25, chives: 0.25, chive: 0.25,
  spinach: 0.13, kale: 0.1, arugula: 0.09, lettuce: 0.09,
  // Chopped vegetables and fruit
  onion: 0.68, onions: 0.68, carrot: 0.54, carrots: 0.54, celery: 0.42, 'bell pepper': 0.63, broccoli: 0.38,
  mushrooms: 0.3, tomato: 0.76, tomatoes: 0.76, cabbage: 0.3, potato: 0.63, potatoes: 0.63, corn: 0.65, peas: 0.61,
  garlic: 0.6, ginger: 0.4, blueberries: 0.63, strawberries: 0.7, raspberries: 0.53, banana: 0.95, apple: 0.53,
  // Salt and spices
  salt: 1.2, 'black pepper': 0.47, pepper: 0.47, cinnamon: 0.53, cumin: 0.43, paprika: 0.47, 'chili powder': 0.5,
  'garlic powder': 0.6, 'onion powder': 0.45, turmeric: 0.6, oregano: 0.2, thyme: 0.2, nutmeg: 0.5,
  'ground ginger': 0.37,
};

/** Words that mean the ingredient is a liquid or a sauce, so a volume should stay a volume. */
const LIQUID = /\b(milk|juice|broth|stock|water|sauce|extract|vinegar|wine|beer|cream|yogurt|yoghurt|oil|soup|puree)\b/;

function lookup(word: string): number | undefined {
  return SOLID_DENSITY[word] ?? SOLID_DENSITY[word.replace(/(es|s)$/, '')];
}

/** Grams per mL for a solid ingredient, or undefined when the item is unknown or a liquid. */
export function solidDensity(item: string | undefined): number | undefined {
  if (!item) return undefined;
  const text = item.toLowerCase().replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const phrases = Object.keys(SOLID_DENSITY).filter((k) => k.includes(' ')).sort((a, b) => b.length - a.length);
  const phrase = phrases.find((p) => ` ${text} `.includes(` ${p} `));
  if (phrase) return SOLID_DENSITY[phrase];
  if (LIQUID.test(text)) return undefined;
  for (const word of text.split(' ')) {
    const density = lookup(word);
    if (density !== undefined) return density;
  }
  return undefined;
}

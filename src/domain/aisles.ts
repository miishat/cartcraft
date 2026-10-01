export interface AisleDef {
  id: string;
  name: string;
}

export const OTHER_AISLE = 'other';

export const DEFAULT_AISLES: AisleDef[] = [
  { id: 'produce', name: 'Produce' },
  { id: 'meat-seafood', name: 'Meat & Seafood' },
  { id: 'dairy-eggs', name: 'Dairy & Eggs' },
  { id: 'bakery', name: 'Bakery' },
  { id: 'pantry', name: 'Pantry & Dry Goods' },
  { id: 'canned', name: 'Canned & Jarred' },
  { id: 'spices-oils', name: 'Spices & Oils' },
  { id: 'frozen', name: 'Frozen' },
  { id: 'beverages', name: 'Beverages' },
  { id: 'household', name: 'Household' },
  { id: OTHER_AISLE, name: 'Other' },
];

/** Keys are itemKeys (lowercase, singular). Written for CartCraft; not derived from AGPL or ODbL sources. */
const BY_AISLE: Record<string, string[]> = {
  produce: [
    'apple', 'avocado', 'banana', 'basil', 'bean sprout', 'beet', 'bell pepper', 'berry', 'blackberry',
    'blueberry', 'bok choy', 'broccoli', 'brussels sprout', 'butternut squash', 'cabbage', 'cantaloupe',
    'carrot', 'cauliflower', 'celery', 'chard', 'cherry', 'chili', 'chive', 'cilantro', 'collard greens',
    'corn', 'cranberry', 'cucumber', 'dill', 'eggplant', 'fennel', 'garlic', 'ginger', 'grape',
    'grapefruit', 'green bean', 'green onion', 'herb', 'jalapeno', 'kale', 'kiwi', 'leek',
    'lemon', 'lemongrass', 'lettuce', 'lime', 'mango', 'melon', 'mint', 'mushroom', 'onion', 'orange',
    'oregano leaf', 'parsley', 'parsnip', 'peach', 'pear', 'pea', 'pineapple', 'plum', 'potato',
    'pumpkin', 'radish', 'raspberry', 'red onion', 'romaine', 'rosemary', 'sage', 'shallot',
    'snap pea', 'spinach', 'squash', 'strawberry', 'sweet potato', 'thyme', 'tomato', 'watermelon',
    'yellow onion', 'zucchini', 'arugula', 'asparagus', 'salad greens', 'serrano', 'poblano',
    'garlic clove', 'green pepper', 'lemon juice', 'lime juice',
  ],
  'meat-seafood': [
    'bacon', 'beef', 'breast', 'brisket', 'chicken', 'chop', 'chorizo', 'cod', 'crab', 'drumstick',
    'fillet', 'fish', 'ground beef', 'ground pork', 'ground turkey', 'ham', 'lamb', 'lobster', 'mussel',
    'pancetta', 'pork', 'prosciutto', 'salami', 'salmon', 'sausage', 'scallop', 'shrimp', 'steak',
    'thigh', 'tilapia', 'tuna steak', 'turkey', 'veal', 'wing', 'anchovy fillet',
  ],
  'dairy-eggs': [
    'butter', 'buttermilk', 'cheddar', 'cheese', 'cottage cheese', 'cream', 'cream cheese', 'egg',
    'feta', 'goat cheese', 'greek yogurt', 'half and half', 'heavy cream', 'milk', 'mozzarella',
    'parmesan', 'ricotta', 'sour cream', 'whipping cream', 'yogurt', 'gruyere', 'mascarpone',
    'monterey jack', 'pecorino', 'swiss', 'creme fraiche', 'egg yolk', 'egg white',
  ],
  bakery: [
    'bagel', 'baguette', 'bread', 'brioche', 'bun', 'ciabatta', 'croissant', 'english muffin',
    'hamburger bun', 'naan', 'pita', 'roll', 'sourdough', 'tortilla', 'flatbread',
  ],
  pantry: [
    'all-purpose flour', 'almond', 'baking powder', 'baking soda', 'barley', 'breadcrumb',
    'brown sugar', 'bulgur', 'cashew', 'cereal', 'chickpea flour', 'chocolate', 'chocolate chip',
    'cocoa powder', 'cornmeal', 'cornstarch', 'corn starch', 'couscous', 'cracker', 'flour', 'gram flour', 'granola',
    'honey', 'lentil', 'maple syrup', 'molasses', 'noodle', 'nut', 'oat', 'panko', 'pasta', 'peanut',
    'peanut butter', 'pecan', 'pine nut', 'powdered sugar', 'quinoa', 'raisin', 'rice', 'rolled oat',
    'sesame seed', 'spaghetti', 'sugar', 'superfine sugar', 'walnut', 'yeast', 'penne', 'macaroni',
    'egg noodle', 'ramen', 'tortilla chip', 'dried fruit', 'date', 'pistachio', 'hazelnut', 'chia seed',
    'flaxseed', 'vanilla', 'vanilla extract', 'extract', 'gelatin', 'corn syrup',
  ],
  canned: [
    'applesauce', 'bean', 'black bean', 'broth', 'chickpea', 'coconut milk', 'diced tomato',
    'kidney bean', 'pinto bean', 'stock', 'tomato paste', 'tomato sauce', 'crushed tomato', 'tuna',
    'salsa', 'sauce', 'tomato soup', 'soy sauce', 'fish sauce', 'hot sauce', 'worcestershire sauce', 'ketchup',
    'mustard', 'dijon mustard', 'mayonnaise', 'vinegar', 'balsamic vinegar', 'olive', 'caper',
    'pickle', 'jam', 'peanut sauce', 'pesto', 'curry paste', 'sriracha', 'anchovy', 'artichoke heart',
    'roasted red pepper', 'evaporated milk', 'condensed milk', 'sweetened condensed milk', 'bouillon',
    'hoisin sauce', 'oyster sauce', 'tahini', 'chipotle in adobo',
  ],
  'spices-oils': [
    'allspice', 'bay leaf', 'black pepper', 'canola oil', 'cardamom', 'cayenne', 'chili flake',
    'chili powder', 'cinnamon', 'clove', 'coconut oil', 'coriander', 'cumin', 'curry powder',
    'garlic powder', 'ground cinnamon', 'ground cumin', 'italian seasoning', 'kosher salt', 'nutmeg',
    'oil', 'olive oil', 'onion powder', 'oregano', 'paprika', 'pepper', 'peppercorn',
    'red pepper flake', 'salt', 'sea salt', 'seasoning', 'sesame oil', 'smoked paprika', 'turmeric',
    'vegetable oil', 'cooking spray', 'garam masala', 'ground ginger', 'mustard seed', 'fennel seed',
    'saffron', 'star anise', 'powder', 'spice', 'extra-virgin olive oil',
  ],
  frozen: [
    'frozen corn', 'frozen pea', 'frozen spinach', 'frozen berry', 'ice cream', 'frozen vegetable',
    'puff pastry', 'pie crust', 'frozen fruit', 'phyllo dough',
  ],
  beverages: [
    'beer', 'coffee', 'juice', 'orange juice', 'sparkling water', 'tea', 'wine', 'white wine',
    'red wine', 'soda', 'club soda', 'apple cider', 'water',
  ],
  household: [
    'aluminum foil', 'foil', 'paper towel', 'parchment paper', 'plastic wrap', 'trash bag',
    'dish soap', 'napkin', 'toothpick', 'skewer', 'zip bag',
  ],
};

export const AISLE_DICTIONARY: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(Object.entries(BY_AISLE).flatMap(([aisle, keys]) => keys.map((k) => [k, aisle]))),
);

/**
 * Override (user or cached LLM answer), then exact dictionary match, then the longest matching
 * suffix ("smoked paprika" -> "paprika"), then the longest matching prefix ("chicken thigh" ->
 * "chicken"), else Other.
 */
export function classifyAisle(
  key: string,
  overrides: ReadonlyMap<string, string>,
  dictionary: Readonly<Record<string, string>> = AISLE_DICTIONARY,
): string {
  if (!key) return OTHER_AISLE;
  const override = overrides.get(key);
  if (override) return override;
  const exact = dictionary[key];
  if (exact) return exact;
  const words = key.split(' ');
  for (let i = 1; i < words.length; i++) {
    const match = dictionary[words.slice(i).join(' ')];
    if (match) return match;
  }
  for (let i = words.length - 1; i > 0; i--) {
    const match = dictionary[words.slice(0, i).join(' ')];
    if (match) return match;
  }
  return OTHER_AISLE;
}

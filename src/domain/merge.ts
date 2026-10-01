import { scaleLine } from './scale';
import type { Amount, IngredientLine, ListItem, Quantity } from './types';
import { dimensionOf, toBaseUnits } from './units';

export interface RecipeSelection {
  title: string;
  baseServings: number;
  targetServings: number;
  ingredients: IngredientLine[];
}

export interface BuildContext {
  pantryStaples: ReadonlySet<string>;
  classify: (itemKey: string) => string;
  makeId: () => string;
}

interface Group {
  name: string;
  buckets: Map<string, Amount>;
  notes: string[];
  fromRecipes: string[];
}

function addQuantities(a: Quantity, b: Quantity): Quantity {
  const min = a.min + b.min;
  if (a.max === undefined && b.max === undefined) return { min };
  return { min, max: (a.max ?? a.min) + (b.max ?? b.min) };
}

function toBucket(line: IngredientLine & { quantity: Quantity }): { key: string; amount: Amount } {
  const { quantity, unit, packageSize } = line;
  const dimension = dimensionOf(unit);
  if (unit !== undefined && (dimension === 'volume' || dimension === 'mass')) {
    const baseUnit = dimension === 'volume' ? 'ml' : 'g';
    const scaled: Quantity = quantity.max === undefined
      ? { min: toBaseUnits(quantity.min, unit) }
      : { min: toBaseUnits(quantity.min, unit), max: toBaseUnits(quantity.max, unit) };
    return { key: dimension, amount: { quantity: scaled, unit: baseUnit } };
  }
  if (unit === undefined) return { key: 'count', amount: { quantity } };
  const pkgKey = packageSize ? `${packageSize.quantity}${packageSize.unit}` : '';
  return {
    key: `other:${unit}:${pkgKey}`,
    amount: { quantity, unit, ...(packageSize ? { packageSize } : {}) },
  };
}

/**
 * Scales every selected recipe, groups lines by itemKey and sums compatible amounts.
 * Volume is summed in mL and mass in g; incompatible units stay as separate amounts.
 */
export function buildListItems(selections: RecipeSelection[], ctx: BuildContext): ListItem[] {
  const groups = new Map<string, Group>();

  for (const selection of selections) {
    for (const original of selection.ingredients) {
      if (original.isHeader || !original.itemKey) continue;
      const line = scaleLine(original, selection.baseServings, selection.targetServings);

      let group = groups.get(line.itemKey);
      if (!group) {
        group = { name: line.item, buckets: new Map(), notes: [], fromRecipes: [] };
        groups.set(line.itemKey, group);
      }
      if (!group.fromRecipes.includes(selection.title)) group.fromRecipes.push(selection.title);
      if (line.notes && !group.notes.includes(line.notes)) group.notes.push(line.notes);
      if (!line.quantity) continue;

      const { key, amount } = toBucket({ ...line, quantity: line.quantity });
      const existing = group.buckets.get(key);
      group.buckets.set(key, existing ? { ...existing, quantity: addQuantities(existing.quantity, amount.quantity) } : amount);
    }
  }

  return [...groups.entries()]
    .map(([key, group]): ListItem => ({
      id: ctx.makeId(),
      itemKey: key,
      name: group.name,
      amounts: [...group.buckets.values()],
      aisleId: ctx.classify(key),
      group: ctx.pantryStaples.has(key) ? 'pantry' : 'aisle',
      checked: false,
      origin: 'recipe',
      fromRecipes: group.fromRecipes,
      notes: group.notes.join('; '),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en') || (a.itemKey < b.itemKey ? -1 : a.itemKey > b.itemKey ? 1 : 0));
}

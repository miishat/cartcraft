import {
  OTHER_AISLE, buildListItems, classifyAisle, parseIngredientLine, type Amount, type ListItem,
} from '../domain';
import type { CartCraftDb } from '../data/db';
import type { ShoppingList } from '../data/types';

export interface Selection {
  recipeId: string;
  targetServings: number;
}

export function defaultListName(now: number): string {
  const date = new Date(now).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `Shopping list, ${date}`;
}

async function loadClassifier(db: CartCraftDb): Promise<(itemKey: string) => string> {
  const overrides = new Map((await db.aisleOverrides.toArray()).map((o) => [o.itemKey, o.aisleId]));
  return (key) => classifyAisle(key, overrides);
}

/** Builds a new list snapshot from the selected recipes. Recipes edited later never change it. */
export async function createList(
  db: CartCraftDb,
  selections: Selection[],
  now: number,
  makeId: () => string,
): Promise<string> {
  const recipes = await db.recipes.bulkGet(selections.map((s) => s.recipeId));
  const chosen = selections.flatMap((s, i) => {
    const recipe = recipes[i];
    return recipe ? [{ recipe, targetServings: s.targetServings }] : [];
  });
  if (chosen.length === 0) throw new Error('No recipes selected');

  const pantryStaples = new Set((await db.pantryStaples.toArray()).map((p) => p.itemKey));
  const classify = await loadClassifier(db);
  const items = buildListItems(
    chosen.map(({ recipe, targetServings }) => ({
      title: recipe.title,
      baseServings: recipe.baseServings,
      targetServings,
      ingredients: recipe.ingredients,
    })),
    { pantryStaples, classify, makeId },
  );

  const list: ShoppingList = {
    id: makeId(),
    name: defaultListName(now),
    createdAt: now,
    sources: chosen.map(({ recipe, targetServings }) => ({ recipeId: recipe.id, title: recipe.title, targetServings })),
    items,
  };
  await db.lists.add(list);
  return list.id;
}

async function updateItems(
  db: CartCraftDb,
  listId: string,
  change: (items: ListItem[]) => ListItem[],
): Promise<void> {
  await db.transaction('rw', db.lists, async () => {
    const list = await db.lists.get(listId);
    if (!list) throw new Error(`List ${listId} not found`);
    await db.lists.update(listId, { items: change(list.items) });
  });
}

export async function setItemChecked(
  db: CartCraftDb,
  listId: string,
  itemId: string,
  checked: boolean,
  now: number,
): Promise<void> {
  await updateItems(db, listId, (items) =>
    items.map((item) => {
      if (item.id !== itemId) return item;
      if (checked) return { ...item, checked: true, checkedAt: now };
      const { checkedAt: _dropped, ...rest } = item;
      return { ...rest, checked: false };
    }),
  );
}

function itemFromText(text: string, id: string, classify: (key: string) => string): Omit<ListItem, 'checked' | 'origin' | 'fromRecipes'> {
  const line = parseIngredientLine(text, id);
  const amounts: Amount[] = line.quantity
    ? [{ quantity: line.quantity, ...(line.unit ? { unit: line.unit } : {}), ...(line.packageSize ? { packageSize: line.packageSize } : {}) }]
    : [];
  return {
    id,
    itemKey: line.itemKey,
    name: line.item || text.trim(),
    amounts,
    aisleId: line.itemKey ? classify(line.itemKey) : OTHER_AISLE,
    group: 'aisle',
    notes: line.notes,
  };
}

/** Adds a one-off item ("paper towels", "2 lb apples"), parsed and classified like recipe lines. */
export async function addAdhocItem(db: CartCraftDb, listId: string, text: string, makeId: () => string): Promise<string> {
  if (!text.trim()) throw new Error('Item text is required');
  const classify = await loadClassifier(db);
  const item: ListItem = { ...itemFromText(text, makeId(), classify), checked: false, origin: 'adhoc', fromRecipes: [] };
  await updateItems(db, listId, (items) => [...items, item]);
  return item.id;
}

/** Replaces an item's name, amount and notes from edited text. Aisle, check state and origin are kept. */
export async function editItem(db: CartCraftDb, listId: string, itemId: string, text: string): Promise<void> {
  if (!text.trim()) throw new Error('Item text is required');
  const classify = await loadClassifier(db);
  await updateItems(db, listId, (items) =>
    items.map((item) => {
      if (item.id !== itemId) return item;
      const parsed = itemFromText(text, item.id, classify);
      return { ...item, itemKey: parsed.itemKey, name: parsed.name, amounts: parsed.amounts, notes: parsed.notes };
    }),
  );
}

export async function deleteItem(db: CartCraftDb, listId: string, itemId: string): Promise<void> {
  await updateItems(db, listId, (items) => items.filter((item) => item.id !== itemId));
}

/** Moves an item and remembers the choice for that itemKey in future lists. */
export async function moveItemToAisle(db: CartCraftDb, listId: string, itemId: string, aisleId: string): Promise<void> {
  await db.transaction('rw', db.lists, db.aisleOverrides, async () => {
    const list = await db.lists.get(listId);
    const item = list?.items.find((i) => i.id === itemId);
    if (!list || !item) throw new Error(`Item ${itemId} not found`);
    await db.lists.update(listId, {
      items: list.items.map((i) => (i.id === itemId ? { ...i, aisleId, group: 'aisle' as const } : i)),
    });
    if (item.itemKey) await db.aisleOverrides.put({ itemKey: item.itemKey, aisleId, source: 'user' });
  });
}

export async function renameList(db: CartCraftDb, listId: string, name: string): Promise<void> {
  if (!name.trim()) throw new Error('Name is required');
  await db.lists.update(listId, { name: name.trim() });
}

export async function deleteList(db: CartCraftDb, listId: string): Promise<void> {
  await db.lists.delete(listId);
}

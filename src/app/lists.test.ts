import { describe, expect, it } from 'vitest';
import { formatAmounts } from '../domain';
import type { CartCraftDb } from '../data/db';
import { createTestDb, sequentialIds } from '../test/db';
import {
  addAdhocItem, createList, defaultListName, deleteItem, deleteList, editItem, moveItemToAisle,
  renameList, setItemChecked,
} from './lists';
import { itemEditText } from './listView';
import { draftLinesFromText, saveRecipe } from './recipes';

async function addRecipe(db: CartCraftDb, title: string, text: string, baseServings = 4): Promise<string> {
  const ids = sequentialIds(title);
  return saveRecipe(db, { title, rawText: text, baseServings, ingredients: draftLinesFromText(text, ids) }, 1, ids);
}

async function setup() {
  const db = createTestDb();
  const tacos = await addRecipe(db, 'Tacos', '1 lb ground beef\n1 onion\nSalt, to taste');
  const soup = await addRecipe(db, 'Soup', '2 onions\n4 cups chicken broth', 2);
  return { db, tacos, soup };
}

describe('createList', () => {
  it('builds a named snapshot from the selected recipes with per-recipe servings', async () => {
    const { db, tacos, soup } = await setup();
    const now = Date.UTC(2026, 9, 1, 12);
    const id = await createList(db, [{ recipeId: tacos, targetServings: 4 }, { recipeId: soup, targetServings: 4 }], now, sequentialIds('x'));
    const list = (await db.lists.get(id))!;
    expect(list.name).toBe(defaultListName(now));
    expect(list.sources).toEqual([
      { recipeId: tacos, title: 'Tacos', targetServings: 4 },
      { recipeId: soup, title: 'Soup', targetServings: 4 },
    ]);
    const byKey = Object.fromEntries(list.items.map((i) => [i.itemKey, i]));
    expect(formatAmounts(byKey.onion!.amounts, 'us')).toBe('5');
    expect(formatAmounts(byKey['chicken broth']!.amounts, 'us')).toBe('8 cups');
    expect(byKey.onion!.aisleId).toBe('produce');
    expect(byKey.salt!.group).toBe('pantry');
  });

  it('uses saved aisle overrides', async () => {
    const { db, tacos } = await setup();
    await db.aisleOverrides.put({ itemKey: 'onion', aisleId: 'frozen', source: 'user' });
    const id = await createList(db, [{ recipeId: tacos, targetServings: 4 }], 1, sequentialIds());
    expect((await db.lists.get(id))!.items.find((i) => i.itemKey === 'onion')!.aisleId).toBe('frozen');
  });

  it('is not changed by later recipe edits', async () => {
    const { db, tacos } = await setup();
    const id = await createList(db, [{ recipeId: tacos, targetServings: 4 }], 1, sequentialIds());
    await db.recipes.update(tacos, { title: 'Changed', ingredients: [] });
    const list = (await db.lists.get(id))!;
    expect(list.sources[0]!.title).toBe('Tacos');
    expect(list.items.length).toBe(3);
  });

  it('rejects an empty selection', async () => {
    const { db } = await setup();
    await expect(createList(db, [], 1, sequentialIds())).rejects.toThrow('No recipes selected');
  });
});

describe('list edits', () => {
  async function withList() {
    const { db, tacos } = await setup();
    const listId = await createList(db, [{ recipeId: tacos, targetServings: 4 }], 1, sequentialIds('item'));
    const onion = (await db.lists.get(listId))!.items.find((i) => i.itemKey === 'onion')!;
    return { db, listId, onion };
  }

  it('checks and unchecks an item', async () => {
    const { db, listId, onion } = await withList();
    await setItemChecked(db, listId, onion.id, true, 500);
    expect((await db.lists.get(listId))!.items.find((i) => i.id === onion.id)).toMatchObject({ checked: true, checkedAt: 500 });
    await setItemChecked(db, listId, onion.id, false, 600);
    const item = (await db.lists.get(listId))!.items.find((i) => i.id === onion.id)!;
    expect(item.checked).toBe(false);
    expect(item.checkedAt).toBeUndefined();
  });

  it('adds a parsed, classified ad-hoc item', async () => {
    const { db, listId } = await withList();
    const id = await addAdhocItem(db, listId, '2 lb apples', sequentialIds('adhoc'));
    const item = (await db.lists.get(listId))!.items.find((i) => i.id === id)!;
    expect(item).toMatchObject({ name: 'apples', itemKey: 'apple', aisleId: 'produce', origin: 'adhoc', checked: false });
    expect(formatAmounts(item.amounts, 'us')).toBe('2 lb');
  });

  it('adds an unknown ad-hoc item to Other', async () => {
    const { db, listId } = await withList();
    const id = await addAdhocItem(db, listId, 'birthday candles', sequentialIds('adhoc'));
    expect((await db.lists.get(listId))!.items.find((i) => i.id === id)!.aisleId).toBe('other');
  });

  it('edits an item from text and keeps its aisle and check state', async () => {
    const { db, listId, onion } = await withList();
    await setItemChecked(db, listId, onion.id, true, 1);
    await editItem(db, listId, onion.id, '3 red onions');
    const item = (await db.lists.get(listId))!.items.find((i) => i.id === onion.id)!;
    expect(item).toMatchObject({ name: 'red onions', itemKey: 'red onion', aisleId: 'produce', checked: true });
    expect(formatAmounts(item.amounts, 'us')).toBe('3');
  });

  it('keeps notes when editing through itemEditText', async () => {
    const { db, listId } = await withList();
    const id = await addAdhocItem(db, listId, '2 cups milk, whole', sequentialIds('adhoc'));
    const before = (await db.lists.get(listId))!.items.find((i) => i.id === id)!;
    await editItem(db, listId, id, itemEditText(before, 'us').replace('2 cups', '3 cups'));
    const after = (await db.lists.get(listId))!.items.find((i) => i.id === id)!;
    expect(after.notes).toBe('whole');
    expect(formatAmounts(after.amounts, 'us')).toBe('3 cups');
  });

  it('deletes an item', async () => {
    const { db, listId, onion } = await withList();
    await deleteItem(db, listId, onion.id);
    expect((await db.lists.get(listId))!.items.some((i) => i.id === onion.id)).toBe(false);
  });

  it('moves an item and remembers the aisle', async () => {
    const { db, listId, onion } = await withList();
    await moveItemToAisle(db, listId, onion.id, 'frozen');
    expect((await db.lists.get(listId))!.items.find((i) => i.id === onion.id)!.aisleId).toBe('frozen');
    expect(await db.aisleOverrides.get('onion')).toEqual({ itemKey: 'onion', aisleId: 'frozen', source: 'user' });
  });

  it('renames and deletes a list', async () => {
    const { db, listId } = await withList();
    await renameList(db, listId, '  Weekend ');
    expect((await db.lists.get(listId))!.name).toBe('Weekend');
    await deleteList(db, listId);
    expect(await db.lists.count()).toBe(0);
  });
});

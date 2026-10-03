import { describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { DEFAULT_AISLES, parseIngredientLine } from '../domain';
import { createTestDb } from '../test/db';
import { CartCraftDb, DEFAULT_PANTRY, DEFAULT_SETTINGS, getSettings, updateSettings } from './db';

describe('CartCraftDb', () => {
  it('seeds aisles in default order, pantry staples and settings on first open', async () => {
    const db = createTestDb();
    const aisles = await db.aisles.orderBy('order').toArray();
    expect(aisles.map((a) => a.id)).toEqual(DEFAULT_AISLES.map((a) => a.id));
    expect((await db.pantryStaples.toArray()).map((p) => p.itemKey).sort()).toEqual([...DEFAULT_PANTRY].sort());
    expect(await getSettings(db)).toEqual(DEFAULT_SETTINGS);
  });

  it('updates settings without touching other fields', async () => {
    const db = createTestDb();
    await updateSettings(db, { unitSystem: 'metric' });
    expect(await getSettings(db)).toEqual({ ...DEFAULT_SETTINGS, unitSystem: 'metric' });
  });

  it('keeps secrets in their own table', async () => {
    const db = createTestDb();
    await db.secrets.put({ id: 'secrets', llmApiKey: 'sk-test' });
    expect((await db.secrets.get('secrets'))?.llmApiKey).toBe('sk-test');
  });

  it('re-parses saved ingredient lines when upgrading from version 1', async () => {
    const name = `cartcraft-upgrade-${Math.random().toString(36).slice(2)}`;
    const v1 = new Dexie(name);
    v1.version(1).stores({ recipes: 'id, title, updatedAt', lists: 'id, createdAt', pantryStaples: 'itemKey', aisles: 'id, order', aisleOverrides: 'itemKey', settings: 'id', secrets: 'id', snapshots: 'id' });
    const raw = '2 tbsp vegetable oil ((or other plain oil))';
    const broken = { ...parseIngredientLine(raw, 'l1'), item: 'vegetable oil )', notes: '(or other plain oil' };
    const flagged = { ...parseIngredientLine('3 eggs', 'l2'), needsReview: true };
    await v1.table('recipes').add({ id: 'r1', title: 'Biryani', rawText: raw, baseServings: 8, ingredients: [broken, flagged], createdAt: 1, updatedAt: 1 });
    v1.close();

    const db = new CartCraftDb(name);
    const recipe = await db.recipes.get('r1');
    expect(recipe?.ingredients[0]).toMatchObject({ id: 'l1', item: 'vegetable oil', alternatives: ['other plain oil'] });
    expect(recipe?.ingredients[1]).toMatchObject({ id: 'l2', item: 'eggs', needsReview: true });
    db.close();
  });
});

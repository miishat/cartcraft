import { describe, expect, it, vi } from 'vitest';
import { getSettings } from '../data/db';
import { createTestDb, sequentialIds } from '../test/db';
import {
  RecipeValidationError, deleteRecipe, draftLinesFromText, fetchMissingSteps, reparseLine, requestPersistence, saveRecipe,
} from './recipes';
import type { UrlImportResult } from '../services/urlImport';

describe('draftLinesFromText', () => {
  it('parses each non-blank line with a fresh id', () => {
    const lines = draftLinesFromText('2 cups flour\n\n  \n3 eggs\r\n', sequentialIds('line'));
    expect(lines.map((l) => [l.id, l.itemKey])).toEqual([['line-1', 'flour'], ['line-2', 'egg']]);
  });
});

describe('reparseLine', () => {
  it('keeps the id', () => {
    const [line] = draftLinesFromText('2 cups flour', sequentialIds());
    const edited = reparseLine(line!, '3 cups sugar');
    expect(edited.id).toBe(line!.id);
    expect(edited.itemKey).toBe('sugar');
  });
});

describe('saveRecipe', () => {
  const input = {
    title: '  Pancakes ',
    rawText: '2 cups flour',
    baseServings: 4,
    ingredients: draftLinesFromText('2 cups flour', sequentialIds('line')),
  };

  it('creates a recipe with timestamps and a trimmed title', async () => {
    const db = createTestDb();
    const id = await saveRecipe(db, input, 1000, sequentialIds('recipe'));
    expect(id).toBe('recipe-1');
    expect(await db.recipes.get(id)).toMatchObject({ title: 'Pancakes', baseServings: 4, createdAt: 1000, updatedAt: 1000 });
  });

  it('stores steps when given and none otherwise', async () => {
    const db = createTestDb();
    const steps = [{ text: 'Mix.', isHeader: false }];
    const withSteps = await saveRecipe(db, { ...input, steps }, 1000, sequentialIds('a'));
    const without = await saveRecipe(db, input, 1000, sequentialIds('b'));
    expect((await db.recipes.get(withSteps))?.steps).toEqual(steps);
    expect(await db.recipes.get(without)).not.toHaveProperty('steps');
  });

  it('updates an existing recipe and keeps createdAt', async () => {
    const db = createTestDb();
    const id = await saveRecipe(db, input, 1000, sequentialIds('recipe'));
    await saveRecipe(db, { ...input, id, title: 'Crepes' }, 2000, sequentialIds('unused'));
    expect(await db.recipes.get(id)).toMatchObject({ title: 'Crepes', createdAt: 1000, updatedAt: 2000 });
    expect(await db.recipes.count()).toBe(1);
  });

  it.each([
    [{ title: '   ' }],
    [{ baseServings: 0 }],
    [{ baseServings: Number.NaN }],
  ])('rejects %j', async (patch) => {
    const db = createTestDb();
    await expect(saveRecipe(db, { ...input, ...patch }, 1, sequentialIds())).rejects.toBeInstanceOf(RecipeValidationError);
  });

  it('deletes a recipe', async () => {
    const db = createTestDb();
    const id = await saveRecipe(db, input, 1, sequentialIds());
    await deleteRecipe(db, id);
    expect(await db.recipes.count()).toBe(0);
  });
});

describe('requestPersistence', () => {
  it('records the result in settings', async () => {
    const db = createTestDb();
    const storage = { persisted: vi.fn(async () => false), persist: vi.fn(async () => true) };
    expect(await requestPersistence(db, storage)).toBe(true);
    expect((await getSettings(db)).persistGranted).toBe(true);
  });

  it('swallows browser errors', async () => {
    const db = createTestDb();
    const storage = { persisted: vi.fn(async () => false), persist: vi.fn(async () => { throw new Error('denied'); }) };
    expect(await requestPersistence(db, storage)).toBeUndefined();
    expect((await getSettings(db)).persistGranted).toBeUndefined();
  });

  it('does nothing when the API is missing', async () => {
    const db = createTestDb();
    expect(await requestPersistence(db, undefined)).toBeUndefined();
    expect((await getSettings(db)).persistGranted).toBeUndefined();
  });
});

describe('fetchMissingSteps', () => {
  const sourceUrl = 'https://example.com/r';
  async function seed(extra: { sourceUrl?: string; steps?: { text: string; isHeader: boolean }[] }) {
    const db = createTestDb();
    const ids = sequentialIds('r');
    const id = await saveRecipe(
      db,
      { title: 'Eggs', rawText: '2 eggs', baseServings: 2, ingredients: draftLinesFromText('2 eggs', ids), ...extra },
      1,
      ids,
    );
    return { db, id };
  }

  it('stores steps for a recipe that has none, leaving ingredients alone', async () => {
    const { db, id } = await seed({ sourceUrl });
    const before = (await db.recipes.get(id))!.ingredients;
    const fake = vi.fn(async (): Promise<UrlImportResult> => ({
      ok: true,
      recipe: { title: 'X', ingredients: ['9 eggs'], steps: [{ text: 'Boil', isHeader: false }], sourceUrl } as never,
    }));
    await fetchMissingSteps(db, id, fake);
    const after = await db.recipes.get(id);
    expect(fake).toHaveBeenCalledWith(sourceUrl);
    expect(after?.steps).toEqual([{ text: 'Boil', isHeader: false }]);
    expect(after?.ingredients).toEqual(before);
  });

  it('stores an empty list when the page has no recipe data', async () => {
    const { db, id } = await seed({ sourceUrl });
    await fetchMissingSteps(db, id, async () => ({ ok: false, error: 'no_recipe_data' }));
    expect((await db.recipes.get(id))?.steps).toEqual([]);
  });

  it('leaves steps missing after a network failure so it retries later', async () => {
    const { db, id } = await seed({ sourceUrl });
    await fetchMissingSteps(db, id, async () => ({ ok: false, error: 'fetch_failed' }));
    expect((await db.recipes.get(id))?.steps).toBeUndefined();
  });

  it('does nothing when steps exist or there is no source', async () => {
    const fake = vi.fn();
    const withSteps = await seed({ sourceUrl, steps: [{ text: 'Boil', isHeader: false }] });
    await fetchMissingSteps(withSteps.db, withSteps.id, fake);
    const noSource = await seed({});
    await fetchMissingSteps(noSource.db, noSource.id, fake);
    expect(fake).not.toHaveBeenCalled();
  });
});

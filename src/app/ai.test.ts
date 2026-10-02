import { describe, expect, it, vi } from 'vitest';
import { updateSettings, type CartCraftDb } from '../data/db';
import { createTestDb, sequentialIds } from '../test/db';
import {
  AiNotConfiguredError, aiCleanUpText, aiSortUnknownItems, aiSwapsAndTips, clearAiKey, getLlmConfig,
  hasInventedNumber, saveAiKey, testAiConnection,
} from './ai';
import { addAdhocItem, createList } from './lists';
import { draftLinesFromText, saveRecipe } from './recipes';

function reply(json: unknown) {
  return vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(json) } }] })));
}

async function configured(): Promise<CartCraftDb> {
  const db = createTestDb();
  await saveAiKey(db, ' sk-test ');
  return db;
}

async function listWith(db: CartCraftDb, text: string): Promise<string> {
  const ids = sequentialIds('r');
  const recipeId = await saveRecipe(db, { title: 'Dinner', rawText: text, baseServings: 2, ingredients: draftLinesFromText(text, ids) }, 1, ids);
  return createList(db, [{ recipeId, targetServings: 2 }], 1, ids);
}

describe('AI key and config', () => {
  it('saves, reads and clears the key with the selected provider', async () => {
    const db = await configured();
    await updateSettings(db, { llm: { providerId: 'groq', model: 'custom' } });
    const config = await getLlmConfig(db);
    expect(config?.provider.id).toBe('groq');
    expect(config?.model).toBe('custom');
    expect(config?.apiKey).toBe('sk-test');
    await clearAiKey(db);
    expect(await getLlmConfig(db)).toBeNull();
  });

  it('rejects a blank key', async () => {
    await expect(saveAiKey(createTestDb(), '  ')).rejects.toThrow('Enter a key first.');
  });

  it('every AI action explains how to enable it when no key is saved', async () => {
    const db = createTestDb();
    await expect(aiCleanUpText(db, 'x', sequentialIds())).rejects.toBeInstanceOf(AiNotConfiguredError);
    await expect(aiSortUnknownItems(db, 'l')).rejects.toThrow('Add an AI key in Settings to use this.');
    await expect(aiSwapsAndTips(db, 'l', 1)).rejects.toBeInstanceOf(AiNotConfiguredError);
  });
});

describe('hasInventedNumber', () => {
  it.each([
    ['2 cups flour', 'You need 2 cups flour and eggs', false],
    ['1/2 cup cream', 'Add ½ cup cream', false],
    ['3 eggs', 'Crack the eggs', true],
    ['1 tsp salt', 'salt to taste', true],
    ['salt', 'salt to taste', false],
    ['2 eggs', '12 eggs', true],
    ['1 tsp salt', '10 g salt', true],
    ['2 eggs', 'Use 2 eggs and 12 g butter', false],
  ])('%s in %j -> %s', (line, source, expected) => {
    expect(hasInventedNumber(line, source)).toBe(expected);
  });
});

describe('aiCleanUpText', () => {
  it('parses the AI lines and flags numbers missing from the source', async () => {
    const db = await configured();
    const fetchImpl = reply({ title: 'Pancakes', servings: 4, ingredients: ['2 cups flour', '3 eggs'] });
    const draft = await aiCleanUpText(db, 'Grandma used 2 cups flour and some eggs. Serves 4.', sequentialIds('l'), fetchImpl);
    expect(draft.title).toBe('Pancakes');
    expect(draft.servings).toBe(4);
    expect(draft.lines.map((l) => [l.id, l.itemKey, l.needsReview])).toEqual([['l-1', 'flour', false], ['l-2', 'egg', true]]);
  });
});

describe('aiCleanUpText servings', () => {
  it('drops AI servings that the source text never mentions', async () => {
    const db = await configured();
    const fetchImpl = reply({ title: 'Pancakes', servings: 4, ingredients: ['2 cups flour'] });
    const draft = await aiCleanUpText(db, 'Grandma used 2 cups flour.', sequentialIds('l'), fetchImpl);
    expect(draft.servings).toBeUndefined();
  });
});

describe('aiSortUnknownItems', () => {
  it('moves Other items, remembers answers, and never overrides a user choice', async () => {
    const db = await configured();
    const listId = await listWith(db, '1 dragon fruit\n1 jar gochujang\n2 onions');
    await addAdhocItem(db, listId, 'birthday candles', sequentialIds('a'));
    await db.aisleOverrides.put({ itemKey: 'birthday candle', aisleId: 'other', source: 'user' });

    const fetchImpl = reply({
      assignments: [
        { item: 'dragon fruit', aisle: 'produce' },
        { item: 'gochujang', aisle: 'canned' },
        { item: 'birthday candle', aisle: 'household' },
      ],
    });
    expect(await aiSortUnknownItems(db, listId, fetchImpl)).toBe(2);

    const items = Object.fromEntries((await db.lists.get(listId))!.items.map((i) => [i.itemKey, i.aisleId]));
    expect(items).toMatchObject({ 'dragon fruit': 'produce', gochujang: 'canned', onion: 'produce', 'birthday candle': 'other' });
    expect(await db.aisleOverrides.get('dragon fruit')).toEqual({ itemKey: 'dragon fruit', aisleId: 'produce', source: 'llm' });
    expect(await db.aisleOverrides.get('birthday candle')).toEqual({ itemKey: 'birthday candle', aisleId: 'other', source: 'user' });

    const body = JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(JSON.parse(body.messages[1].content).items).toEqual(['dragon fruit', 'gochujang', 'birthday candle']);
  });

  it('leaves the list and overrides untouched when the AI reply is unusable', async () => {
    const db = await configured();
    const listId = await listWith(db, '1 dragon fruit');
    const before = (await db.lists.get(listId))!.items;
    const fetchImpl = reply({ nonsense: true });
    await expect(aiSortUnknownItems(db, listId, fetchImpl)).rejects.toMatchObject({ kind: 'bad_response' });
    expect((await db.lists.get(listId))!.items).toEqual(before);
    expect(await db.aisleOverrides.toArray()).toEqual([]);
  });

  it('does not call the AI when nothing is in Other', async () => {
    const db = await configured();
    const listId = await listWith(db, '2 onions');
    const fetchImpl = reply({ assignments: [] });
    expect(await aiSortUnknownItems(db, listId, fetchImpl)).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('aiSwapsAndTips', () => {
  it('stores swaps and tips on the list', async () => {
    const db = await configured();
    const listId = await listWith(db, '1 pinch saffron\n1 cup rice');
    const extras = await aiSwapsAndTips(db, listId, 99, reply({ swaps: [{ item: 'saffron', swap: 'turmeric' }], tips: ['Freeze leftover rice.'] }));
    expect(extras).toEqual({ swaps: [{ item: 'saffron', swap: 'turmeric' }], tips: ['Freeze leftover rice.'], generatedAt: 99 });
    expect((await db.lists.get(listId))?.extras).toEqual(extras);
  });
});

describe('testAiConnection', () => {
  it('checks the given settings without saving them', async () => {
    const fetchImpl = reply({ ok: true });
    await testAiConnection({ providerId: 'openrouter', model: '', apiKey: 'k' }, fetchImpl);
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toBe('https://openrouter.ai/api/v1/chat/completions');
    await expect(testAiConnection({ providerId: 'deepseek', model: '', apiKey: ' ' })).rejects.toThrow('Enter a key first.');
  });
});

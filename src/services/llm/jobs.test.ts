import { describe, expect, it, vi } from 'vitest';
import { getProvider } from '../providers';
import { LlmError, type LlmConfig } from './client';
import { checkConnection, cleanUpRecipeText, suggestAisles, swapsAndTips } from './jobs';

const config: LlmConfig = { provider: getProvider('deepseek'), model: '', apiKey: 'k' };

function reply(json: unknown) {
  return vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(json) } }] })));
}

function sentMessages(fetchImpl: ReturnType<typeof reply>) {
  return JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body)).messages as { content: string }[];
}

describe('cleanUpRecipeText', () => {
  it('returns trimmed ingredients, title and servings', async () => {
    const fetchImpl = reply({ title: ' Pancakes ', servings: 4, ingredients: [' 2 cups flour ', '', '3 eggs'] });
    expect(await cleanUpRecipeText(config, 'messy blog text', fetchImpl)).toEqual({ title: 'Pancakes', servings: 4, ingredients: ['2 cups flour', '3 eggs'] });
    expect(sentMessages(fetchImpl)[0]?.content).toContain('Never invent, convert or scale amounts');
  });

  it('accepts null servings and a missing title', async () => {
    expect(await cleanUpRecipeText(config, 't', reply({ servings: null, ingredients: ['1 egg'] }))).toEqual({ title: '', ingredients: ['1 egg'] });
  });

  it.each([
    [{ ingredients: [] }],
    [{ ingredients: 'flour' }],
    [{ ingredients: ['', '  '] }],
    [{ title: 'x' }],
  ])('rejects %j', async (json) => {
    await expect(cleanUpRecipeText(config, 't', reply(json))).rejects.toBeInstanceOf(LlmError);
  });

  it('caps the text it sends', async () => {
    const fetchImpl = reply({ ingredients: ['1 egg'] });
    await cleanUpRecipeText(config, 'x'.repeat(50_000), fetchImpl);
    expect(sentMessages(fetchImpl)[1]?.content).toHaveLength(30_000);
  });
});

describe('suggestAisles', () => {
  const aisles = [{ id: 'produce', name: 'Produce' }, { id: 'other', name: 'Other' }];

  it('keeps only known items and aisles, and drops "other"', async () => {
    const fetchImpl = reply({
      assignments: [
        { item: 'dragon fruit', aisle: 'produce' },
        { item: 'mystery', aisle: 'other' },
        { item: 'invented item', aisle: 'produce' },
        { item: 'gochujang', aisle: 'made-up-aisle' },
      ],
    });
    const result = await suggestAisles(config, ['dragon fruit', 'mystery', 'gochujang'], aisles, fetchImpl);
    expect([...result]).toEqual([['dragon fruit', 'produce']]);
    expect(sentMessages(fetchImpl)[0]?.content).toContain('Use only these aisle ids: produce, other');
  });
});

describe('swapsAndTips', () => {
  it('keeps swaps for listed items and caps counts', async () => {
    const fetchImpl = reply({
      swaps: [{ item: 'Saffron', swap: 'turmeric' }, { item: 'unicorn', swap: 'horse' }],
      tips: ['Freeze leftover herbs in oil.', ' ', 't2', 't3', 't4', 't5', 't6'],
    });
    expect(await swapsAndTips(config, ['saffron', 'rice'], fetchImpl)).toEqual({
      swaps: [{ item: 'saffron', swap: 'turmeric' }],
      tips: ['Freeze leftover herbs in oil.', 't2', 't3', 't4', 't5'],
    });
  });

  it('keeps the good parts of a reply that breaks the limits', async () => {
    const fetchImpl = reply({
      swaps: [
        { item: 'Saffron', swap: 'a pinch of turmeric for colour' },
        { item: 'saffron', swap: 'x'.repeat(500) },
        { nope: true },
        { item: 'unknown thing', swap: 'skip me' },
      ],
      tips: [...Array.from({ length: 12 }, (_, i) => `tip ${i}`), 42],
    });
    const result = await swapsAndTips(config, ['saffron', 'onions'], fetchImpl);
    expect(result.swaps[0]).toEqual({ item: 'saffron', swap: 'a pinch of turmeric for colour' });
    expect(result.swaps[1]?.swap).toHaveLength(300);
    expect(result.swaps).toHaveLength(2);
    expect(result.tips).toEqual(['tip 0', 'tip 1', 'tip 2', 'tip 3', 'tip 4']);
  });

  it('accepts a reply with only tips', async () => {
    expect(await swapsAndTips(config, ['onions'], reply({ tips: ['Freeze leftover onion'] }))).toEqual({ swaps: [], tips: ['Freeze leftover onion'] });
  });

  it('gives the model room to think before answering', async () => {
    const fetchImpl = reply({ swaps: [], tips: [] });
    await swapsAndTips(config, ['onions'], fetchImpl);
    const body = JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.max_tokens).toBe(8000);
  });

  it('accepts missing arrays', async () => {
    expect(await swapsAndTips(config, ['rice'], reply({}))).toEqual({ swaps: [], tips: [] });
  });
});

describe('checkConnection', () => {
  it('passes on {"ok": true} and fails otherwise', async () => {
    await expect(checkConnection(config, reply({ ok: true }))).resolves.toBeUndefined();
    await expect(checkConnection(config, reply({ ok: 'yes' }))).rejects.toBeInstanceOf(LlmError);
  });
});

import { normalizeText, parseIngredientLine, type IngredientLine } from '../domain';
import { getSettings, type CartCraftDb } from '../data/db';
import type { ListExtras } from '../data/types';
import { type LlmConfig } from '../services/llm/client';
import { checkConnection, cleanUpRecipeText, suggestAisles, swapsAndTips } from '../services/llm/jobs';
import { getProvider } from '../services/providers';
import { UserFacingError } from './errors';

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export class AiNotConfiguredError extends UserFacingError {
  constructor() {
    super('Add an AI key in Settings to use this.');
  }
}

export async function saveAiKey(db: CartCraftDb, apiKey: string): Promise<void> {
  const key = apiKey.trim();
  if (!key) throw new UserFacingError('Enter a key first.');
  await db.secrets.put({ id: 'secrets', llmApiKey: key });
}

export async function clearAiKey(db: CartCraftDb): Promise<void> {
  await db.secrets.delete('secrets');
}

/** Provider, model and key, or null when no key is saved. */
export async function getLlmConfig(db: CartCraftDb): Promise<LlmConfig | null> {
  const [settings, secrets] = await Promise.all([getSettings(db), db.secrets.get('secrets')]);
  if (!secrets?.llmApiKey) return null;
  return { provider: getProvider(settings.llm.providerId), model: settings.llm.model, apiKey: secrets.llmApiKey };
}

async function requireConfig(db: CartCraftDb): Promise<LlmConfig> {
  const config = await getLlmConfig(db);
  if (!config) throw new AiNotConfiguredError();
  return config;
}

const NUMBER = /\d+(?:[.,/]\d+)?/g;

/** True when the line contains a number that does not appear anywhere in the source text. */
export function hasInventedNumber(line: string, source: string): boolean {
  const haystack = normalizeText(source);
  return (normalizeText(line).match(NUMBER) ?? []).some((n) => !new RegExp(`(?<!\\d)${n.replace(/\./g, '\\.')}(?!\\d)`).test(haystack));
}

export interface AiDraft {
  title: string;
  servings?: number;
  lines: IngredientLine[];
}

/**
 * Turns messy text into ingredient lines with the AI, then parses every line with the normal
 * parser. Lines with numbers the source never mentions are flagged for review.
 */
export async function aiCleanUpText(
  db: CartCraftDb,
  text: string,
  makeId: () => string,
  fetchImpl?: FetchLike,
): Promise<AiDraft> {
  const cleaned = await cleanUpRecipeText(await requireConfig(db), text, fetchImpl);
  const lines = cleaned.ingredients.map((raw) => {
    const line = parseIngredientLine(raw, makeId());
    return hasInventedNumber(raw, text) ? { ...line, needsReview: true } : line;
  });
  return { title: cleaned.title, lines, ...(cleaned.servings ? { servings: cleaned.servings } : {}) };
}

/**
 * Asks the AI for aisles of the list's items that sit in Other, applies the answers to the list,
 * and remembers them as "llm" overrides. A user's own aisle choice is never overwritten.
 * Returns how many items moved.
 */
export async function aiSortUnknownItems(db: CartCraftDb, listId: string, fetchImpl?: FetchLike): Promise<number> {
  const config = await requireConfig(db);
  const [list, aisles] = await Promise.all([db.lists.get(listId), db.aisles.orderBy('order').toArray()]);
  if (!list) throw new UserFacingError('List not found.');
  const keys = [...new Set(list.items.filter((i) => i.group === 'aisle' && i.aisleId === 'other' && i.itemKey).map((i) => i.itemKey))];
  if (keys.length === 0) return 0;

  const answers = await suggestAisles(config, keys, aisles.map(({ id, name }) => ({ id, name })), fetchImpl);
  if (answers.size === 0) return 0;

  let moved = 0;
  await db.transaction('rw', db.lists, db.aisleOverrides, async () => {
    const current = await db.lists.get(listId);
    if (!current) return;
    const userChoices = new Set((await db.aisleOverrides.where('itemKey').anyOf([...answers.keys()]).toArray())
      .filter((o) => o.source === 'user')
      .map((o) => o.itemKey));
    const items = current.items.map((item) => {
      const aisleId = answers.get(item.itemKey);
      if (!aisleId || item.aisleId !== 'other' || userChoices.has(item.itemKey)) return item;
      moved += 1;
      return { ...item, aisleId };
    });
    await db.lists.update(listId, { items });
    await db.aisleOverrides.bulkPut(
      [...answers].filter(([key]) => !userChoices.has(key)).map(([itemKey, aisleId]) => ({ itemKey, aisleId, source: 'llm' as const })),
    );
  });
  return moved;
}

/** Asks for swaps and waste tips for the list's items and stores them on the list. */
export async function aiSwapsAndTips(db: CartCraftDb, listId: string, now: number, fetchImpl?: FetchLike): Promise<ListExtras> {
  const config = await requireConfig(db);
  const list = await db.lists.get(listId);
  if (!list) throw new UserFacingError('List not found.');
  const names = [...new Set(list.items.map((i) => i.name))];
  if (names.length === 0) throw new UserFacingError('Add items to the list first.');
  const result = await swapsAndTips(config, names, fetchImpl);
  const extras: ListExtras = { ...result, generatedAt: now };
  await db.lists.update(listId, { extras });
  return extras;
}

/** Checks a provider, model and key without saving them. */
export async function testAiConnection(
  input: { providerId: string; model: string; apiKey: string },
  fetchImpl?: FetchLike,
): Promise<void> {
  if (!input.apiKey.trim()) throw new UserFacingError('Enter a key first.');
  await checkConnection({ provider: getProvider(input.providerId), model: input.model.trim(), apiKey: input.apiKey.trim() }, fetchImpl);
}

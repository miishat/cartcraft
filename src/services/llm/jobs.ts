import { z } from 'zod';
import { LlmError, chatJson, type LlmConfig } from './client';

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

const MAX_INPUT_CHARS = 30_000;

// --- Clean up messy recipe text -------------------------------------------------------------

export interface CleanedRecipe {
  title: string;
  servings?: number;
  ingredients: string[];
}

const CleanupSchema = z.object({
  title: z.string().max(200).nullish(),
  servings: z.number().positive().max(1000).nullish(),
  ingredients: z.array(z.string().max(300)).min(1).max(200),
});

const CLEANUP_SYSTEM = `You extract the ingredient list from recipe text. Respond with a JSON object only:
{"title": string, "servings": number or null, "ingredients": string[]}
Rules:
- One ingredient per array entry, written the way the source writes it, for example "2 cups flour".
- Copy quantities and units exactly from the source. Never invent, convert or scale amounts.
- Leave out steps, notes, headings, nutrition, prices and anything that is not an ingredient.
- Set servings only if the text says how many servings or people it makes, otherwise null.`;

export async function cleanUpRecipeText(config: LlmConfig, text: string, fetchImpl?: FetchLike): Promise<CleanedRecipe> {
  const raw = await chatJson(config, { system: CLEANUP_SYSTEM, user: text.slice(0, MAX_INPUT_CHARS), maxTokens: 4000 }, fetchImpl);
  const parsed = CleanupSchema.safeParse(raw);
  if (!parsed.success) throw new LlmError('bad_response');
  const ingredients = parsed.data.ingredients.map((s) => s.trim()).filter(Boolean);
  if (ingredients.length === 0) throw new LlmError('bad_response');
  return {
    title: parsed.data.title?.trim() ?? '',
    ingredients,
    ...(parsed.data.servings ? { servings: parsed.data.servings } : {}),
  };
}

// --- Aisle fallback --------------------------------------------------------------------------

const AisleSchema = z.object({
  assignments: z.array(z.object({ item: z.string().max(200), aisle: z.string().max(100) })).max(500),
});

/** Suggests an aisle id for each item. Answers outside `aisles` or for unknown items are dropped. */
export async function suggestAisles(
  config: LlmConfig,
  items: string[],
  aisles: { id: string; name: string }[],
  fetchImpl?: FetchLike,
): Promise<Map<string, string>> {
  const ids = new Set(aisles.map((a) => a.id));
  const system = `You sort grocery items into supermarket aisles. Respond with a JSON object only:
{"assignments": [{"item": string, "aisle": string}]}
Use only these aisle ids: ${[...ids].join(', ')}. Use "other" when unsure. Repeat each item exactly as given.`;
  const raw = await chatJson(config, { system, user: JSON.stringify({ aisles, items }), maxTokens: 2000 }, fetchImpl);
  const parsed = AisleSchema.safeParse(raw);
  if (!parsed.success) throw new LlmError('bad_response');
  const wanted = new Set(items);
  const result = new Map<string, string>();
  for (const { item, aisle } of parsed.data.assignments) {
    if (wanted.has(item) && ids.has(aisle) && aisle !== 'other') result.set(item, aisle);
  }
  return result;
}

// --- Swaps and tips --------------------------------------------------------------------------

export interface SwapsAndTips {
  swaps: { item: string; swap: string }[];
  tips: string[];
}

const ExtrasSchema = z.object({
  swaps: z.array(z.object({ item: z.string().max(200), swap: z.string().max(300) })).max(30).nullish(),
  tips: z.array(z.string().max(400)).max(10).nullish(),
});

const EXTRAS_SYSTEM = `You help someone shop for recipes. Respond with a JSON object only:
{"swaps": [{"item": string, "swap": string}], "tips": string[]}
- swaps: cheaper or easier substitutes for at most 8 items that are niche or expensive. Use item names exactly as given.
- tips: at most 5 short tips for using leftovers or avoiding waste.
Do not mention quantities.`;

export async function swapsAndTips(config: LlmConfig, itemNames: string[], fetchImpl?: FetchLike): Promise<SwapsAndTips> {
  const raw = await chatJson(config, { system: EXTRAS_SYSTEM, user: JSON.stringify({ items: itemNames }), maxTokens: 2000 }, fetchImpl);
  const parsed = ExtrasSchema.safeParse(raw);
  if (!parsed.success) throw new LlmError('bad_response');
  const known = new Set(itemNames.map((n) => n.toLowerCase()));
  return {
    swaps: (parsed.data.swaps ?? []).filter((s) => known.has(s.item.toLowerCase()) && s.swap.trim()).slice(0, 8),
    tips: (parsed.data.tips ?? []).map((t) => t.trim()).filter(Boolean).slice(0, 5),
  };
}

// --- Connection check ------------------------------------------------------------------------

/** Resolves when the provider, model and key work in JSON mode; throws LlmError otherwise. */
export async function checkConnection(config: LlmConfig, fetchImpl?: FetchLike): Promise<void> {
  const raw = await chatJson(config, { system: 'Respond with the JSON object {"ok": true} and nothing else.', user: 'ping', maxTokens: 200 }, fetchImpl);
  if ((raw as { ok?: unknown })?.ok !== true) throw new LlmError('bad_response');
}

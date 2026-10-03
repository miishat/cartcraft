import { parseIngredientLine, type IngredientLine, type RecipeStep } from '../domain';
import { updateSettings, type CartCraftDb } from '../data/db';
import type { Recipe } from '../data/types';
import { UserFacingError } from './errors';

export interface RecipeInput {
  id?: string;
  title: string;
  sourceUrl?: string;
  rawText: string;
  baseServings: number;
  yieldText?: string;
  ingredients: IngredientLine[];
  steps?: RecipeStep[];
}

/** Splits pasted text into lines and parses each one for the review table. Blank lines are dropped. */
export function draftLinesFromText(text: string, makeId: () => string): IngredientLine[] {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map((line) => parseIngredientLine(line, makeId()));
}

/** Re-parses one edited line, keeping its id. */
export function reparseLine(line: IngredientLine, raw: string): IngredientLine {
  return parseIngredientLine(raw, line.id);
}

export class RecipeValidationError extends UserFacingError {}

/** Creates or updates a recipe. Base servings is required and must be positive. */
export async function saveRecipe(
  db: CartCraftDb,
  input: RecipeInput,
  now: number,
  makeId: () => string,
): Promise<string> {
  const title = input.title.trim();
  if (!title) throw new RecipeValidationError('Title is required');
  if (!Number.isFinite(input.baseServings) || input.baseServings <= 0) {
    throw new RecipeValidationError('Base servings must be a positive number');
  }
  const existing = input.id ? await db.recipes.get(input.id) : undefined;
  const recipe: Recipe = {
    id: existing?.id ?? makeId(),
    title,
    rawText: input.rawText,
    baseServings: input.baseServings,
    ingredients: input.ingredients,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    ...(input.sourceUrl ? { sourceUrl: input.sourceUrl } : {}),
    ...(input.steps ? { steps: input.steps } : {}),
    ...(input.yieldText ? { yieldText: input.yieldText } : {}),
  };
  await db.recipes.put(recipe);
  return recipe.id;
}

export async function deleteRecipe(db: CartCraftDb, id: string): Promise<void> {
  await db.recipes.delete(id);
}

/**
 * Asks the browser to keep this site's storage (spec 6). Called after the first save; the
 * result is stored so Settings can show it. Never throws: a missing API or a browser
 * error resolves to undefined.
 */
export async function requestPersistence(
  db: CartCraftDb,
  storage: Pick<StorageManager, 'persist' | 'persisted'> | undefined = globalThis.navigator?.storage,
): Promise<boolean | undefined> {
  if (!storage?.persist) return undefined;
  try {
    const granted = (await storage.persisted?.()) || (await storage.persist());
    await updateSettings(db, { persistGranted: granted });
    return granted;
  } catch {
    return undefined;
  }
}

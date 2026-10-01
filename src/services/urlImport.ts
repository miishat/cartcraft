import { z } from 'zod';
import type { RecipeDraft } from '../domain';

export const IMPORT_ERRORS = [
  'bad_request', 'invalid_url', 'rate_limited', 'blocked', 'timeout', 'too_large', 'no_recipe_data', 'fetch_failed',
] as const;
export type UrlImportError = (typeof IMPORT_ERRORS)[number];

export type UrlImportResult = { ok: true; recipe: RecipeDraft } | { ok: false; error: UrlImportError };
export type PageTextResult = { ok: true; text: string; sourceUrl: string } | { ok: false; error: UrlImportError };

const ErrorSchema = z.object({ ok: z.literal(false), error: z.enum(IMPORT_ERRORS) });
const RecipeSchema = z.object({
  ok: z.literal(true),
  mode: z.literal('recipe'),
  recipe: z.object({
    title: z.string().max(500),
    ingredients: z.array(z.string().max(2000)).max(500),
    servings: z.number().finite().positive().optional(),
    yieldText: z.string().max(500).optional(),
    sourceUrl: z.string().max(2048),
  }),
});
const TextSchema = z.object({ ok: z.literal(true), mode: z.literal('text'), text: z.string(), sourceUrl: z.string().max(2048) });

/** True when the whole input is a single http(s) link. */
export function looksLikeUrl(text: string): boolean {
  return /^https?:\/\/\S+$/i.test(text.trim());
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

async function postImport(body: object, fetchImpl: FetchLike, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl('/api/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return await response.json();
  } catch {
    return { ok: false, error: controller.signal.aborted ? 'timeout' : 'fetch_failed' };
  } finally {
    clearTimeout(timer);
  }
}

/** Asks the import function for the page's schema.org Recipe. Never throws. */
export async function importRecipeFromUrl(
  url: string,
  fetchImpl: FetchLike = (input, init) => fetch(input, init),
  timeoutMs = 20_000,
): Promise<UrlImportResult> {
  const data = await postImport({ url: url.trim() }, fetchImpl, timeoutMs);
  const recipe = RecipeSchema.safeParse(data);
  if (recipe.success) {
    const { title, ingredients, servings, yieldText, sourceUrl } = recipe.data.recipe;
    return {
      ok: true,
      recipe: {
        title,
        ingredients,
        sourceUrl,
        ...(servings !== undefined ? { servings } : {}),
        ...(yieldText !== undefined ? { yieldText } : {}),
      },
    };
  }
  const failure = ErrorSchema.safeParse(data);
  return { ok: false, error: failure.success ? failure.data.error : 'fetch_failed' };
}

/** Asks the import function for the page's visible text (input for the AI clean-up in Plan 4). Never throws. */
export async function fetchPageText(
  url: string,
  fetchImpl: FetchLike = (input, init) => fetch(input, init),
  timeoutMs = 20_000,
): Promise<PageTextResult> {
  const data = await postImport({ url: url.trim(), mode: 'text' }, fetchImpl, timeoutMs);
  const text = TextSchema.safeParse(data);
  if (text.success) return { ok: true, text: text.data.text, sourceUrl: text.data.sourceUrl };
  const failure = ErrorSchema.safeParse(data);
  return { ok: false, error: failure.success ? failure.data.error : 'fetch_failed' };
}

/** What to tell the user, and whether to switch the form to paste mode. */
export const IMPORT_MESSAGES: Record<UrlImportError, { message: string; pasteInstead: boolean }> = {
  blocked: { message: 'This site blocks automatic imports. Open the page, copy the ingredient list and paste it here.', pasteInstead: true },
  no_recipe_data: { message: 'No recipe data found on that page. Copy the ingredient list and paste it here.', pasteInstead: true },
  too_large: { message: 'That page is too large to import. Copy the ingredient list and paste it here.', pasteInstead: true },
  timeout: { message: 'That page took too long to load. Try again, or paste the ingredients instead.', pasteInstead: true },
  fetch_failed: { message: 'Could not reach that page. Check the link, or paste the ingredients instead.', pasteInstead: true },
  bad_request: { message: 'Could not reach that page. Check the link, or paste the ingredients instead.', pasteInstead: true },
  invalid_url: { message: 'That link cannot be imported. Use a public http or https recipe page.', pasteInstead: false },
  rate_limited: { message: 'Too many imports in a row. Wait a minute and try again.', pasteInstead: false },
};

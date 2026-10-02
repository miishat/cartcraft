import { extractRecipe, type RecipeDraft } from '../domain';
import { TooLargeError } from './limitBytes';
import { checkTargetUrl } from './urlGuard';

export type ImportError =
  | 'bad_request'
  | 'invalid_url'
  | 'rate_limited'
  | 'blocked'
  | 'timeout'
  | 'too_large'
  | 'no_recipe_data'
  | 'fetch_failed';

export type ImportResponse =
  | { ok: true; mode: 'recipe'; recipe: RecipeDraft }
  | { ok: true; mode: 'text'; text: string; sourceUrl: string }
  | { ok: false; error: ImportError };

export interface ImportDeps {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  /** Contents of every script[type="application/ld+json"]. Must throw TooLargeError past maxBytes. */
  jsonLdBlocks: (response: Response, maxBytes: number) => Promise<string[]>;
  /** Visible page text without scripts and styles, at most maxChars. Must throw TooLargeError past maxBytes. */
  visibleText: (response: Response, maxBytes: number, maxChars: number) => Promise<string>;
  /** Rate limiter: false means reject. May be async (the Cloudflare rate-limit binding is). */
  allow: (key: string, now: number) => boolean | Promise<boolean>;
  now: () => number;
}

export interface ImportLimits {
  maxBytes: number;
  maxTextChars: number;
  maxRedirects: number;
  timeoutMs: number;
}

export const IMPORT_LIMITS: ImportLimits = {
  maxBytes: 2 * 1024 * 1024,
  maxTextChars: 30_000,
  maxRedirects: 3,
  timeoutMs: 10_000,
};

const USER_AGENT = 'CartCraft-RecipeImporter/1.0 (personal recipe app; reads schema.org Recipe data)';

function json(body: ImportResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function isBlocked(response: Response): boolean {
  return [401, 403, 429, 503].includes(response.status) || response.headers.get('cf-mitigated') === 'challenge';
}

function isHtml(response: Response): boolean {
  const type = response.headers.get('content-type') ?? '';
  return type === '' || /text\/html|application\/xhtml\+xml/i.test(type);
}

/**
 * POST {url, mode?: "recipe" | "text"}. Fetches a public page with manual, re-validated
 * redirects, a timeout and a size cap, and returns only parsed data, never raw HTML.
 */
export async function handleImport(
  request: Request,
  deps: ImportDeps,
  limits: ImportLimits = IMPORT_LIMITS,
): Promise<Response> {
  if (request.method !== 'POST') return json({ ok: false, error: 'bad_request' }, 405);

  const client = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  if (!(await deps.allow(client, deps.now()))) return json({ ok: false, error: 'rate_limited' }, 429);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'bad_request' }, 400);
  }
  const { url, mode } = (body ?? {}) as { url?: unknown; mode?: unknown };
  if (typeof url !== 'string') return json({ ok: false, error: 'invalid_url' }, 400);
  const first = checkTargetUrl(url);
  if (!first.ok) return json({ ok: false, error: 'invalid_url' }, 400);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), limits.timeoutMs);
  try {
    let target = first.url;
    let response: Response;
    for (let hop = 0; ; hop++) {
      response = await deps.fetch(target.href, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
      });
      const location = response.headers.get('location');
      if (response.status < 300 || response.status >= 400 || !location) break;
      if (hop >= limits.maxRedirects) return json({ ok: false, error: 'fetch_failed' });
      const next = checkTargetUrl(new URL(location, target).href);
      if (!next.ok) return json({ ok: false, error: 'invalid_url' });
      target = next.url;
    }

    if (isBlocked(response)) return json({ ok: false, error: 'blocked' });
    if (!response.ok) return json({ ok: false, error: 'fetch_failed' });
    if (!isHtml(response)) return json({ ok: false, error: 'no_recipe_data' });
    if (Number(response.headers.get('content-length') ?? 0) > limits.maxBytes) {
      return json({ ok: false, error: 'too_large' });
    }

    if (mode === 'text') {
      const text = (await deps.visibleText(response, limits.maxBytes, limits.maxTextChars)).trim();
      if (!text) return json({ ok: false, error: 'no_recipe_data' });
      return json({ ok: true, mode: 'text', text, sourceUrl: target.href });
    }

    const recipe = extractRecipe(await deps.jsonLdBlocks(response, limits.maxBytes), target.href);
    if (!recipe || recipe.ingredients.length === 0) return json({ ok: false, error: 'no_recipe_data' });
    return json({ ok: true, mode: 'recipe', recipe });
  } catch (err) {
    if (err instanceof TooLargeError) return json({ ok: false, error: 'too_large' });
    if (controller.signal.aborted) return json({ ok: false, error: 'timeout' });
    return json({ ok: false, error: 'fetch_failed' });
  } finally {
    clearTimeout(timer);
  }
}

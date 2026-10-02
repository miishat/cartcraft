import { describe, expect, it, vi } from 'vitest';
import { IMPORT_LIMITS, handleImport, type ImportDeps, type ImportLimits } from './importRecipe';
import { TooLargeError } from './limitBytes';

const RECIPE_PAGE = `<html><head><script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [{ '@type': 'WebPage' }, { '@type': 'Recipe', name: 'Tacos', recipeIngredient: ['1 lb beef', '8 tortillas'], recipeYield: '4' }],
})}</script></head><body><h1>Tacos</h1><script>var x = 1;</script><p>Brown the beef.</p></body></html>`;

/** Test stand-ins for the HTMLRewriter extractors used in Cloudflare. */
async function naiveJsonLd(response: Response): Promise<string[]> {
  const html = await response.text();
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1] ?? '');
}
async function naiveText(response: Response, _maxBytes: number, maxChars: number): Promise<string> {
  const html = await response.text();
  return html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxChars);
}

function html(body: string, init: ResponseInit = {}): Response {
  return new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, ...init });
}

function deps(fetchImpl: ImportDeps['fetch'], overrides: Partial<ImportDeps> = {}): ImportDeps {
  return { fetch: fetchImpl, jsonLdBlocks: naiveJsonLd, visibleText: naiveText, allow: () => true, now: () => 0, ...overrides };
}

function post(body: unknown): Request {
  return new Request('https://cartcraft.test/api/import', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '203.0.113.9' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function call(request: Request, d: ImportDeps, limits: ImportLimits = IMPORT_LIMITS) {
  const response = await handleImport(request, d, limits);
  return { status: response.status, body: await response.json(), headers: response.headers };
}

describe('handleImport', () => {
  it('returns parsed recipe data from JSON-LD, never HTML', async () => {
    const fetchImpl = vi.fn(async () => html(RECIPE_PAGE));
    const { status, body, headers } = await call(post({ url: 'https://example.com/tacos' }), deps(fetchImpl));
    expect(status).toBe(200);
    expect(body).toEqual({
      ok: true,
      mode: 'recipe',
      recipe: { title: 'Tacos', ingredients: ['1 lb beef', '8 tortillas'], servings: 4, sourceUrl: 'https://example.com/tacos' },
    });
    expect(headers.get('cache-control')).toBe('no-store');
    expect(fetchImpl).toHaveBeenCalledWith('https://example.com/tacos', expect.objectContaining({ redirect: 'manual' }));
  });

  it('returns visible text in text mode', async () => {
    const { body } = await call(post({ url: 'https://example.com/tacos', mode: 'text' }), deps(async () => html(RECIPE_PAGE)));
    expect(body.ok).toBe(true);
    expect(body.mode).toBe('text');
    expect(body.text).toContain('Brown the beef.');
    expect(body.text).not.toContain('var x');
    expect(body.sourceUrl).toBe('https://example.com/tacos');
  });

  it('follows redirects and re-checks each target', async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url === 'https://example.com/old'
        ? new Response(null, { status: 301, headers: { location: '/tacos' } })
        : html(RECIPE_PAGE),
    );
    const { body } = await call(post({ url: 'https://example.com/old' }), deps(fetchImpl));
    expect(body.recipe.sourceUrl).toBe('https://example.com/tacos');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('refuses redirects to private addresses', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest' } }));
    const { body } = await call(post({ url: 'https://example.com/r' }), deps(fetchImpl));
    expect(body).toEqual({ ok: false, error: 'invalid_url' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('stops after too many redirects', async () => {
    let n = 0;
    const fetchImpl = vi.fn(async () => new Response(null, { status: 302, headers: { location: `https://example.com/${++n}` } }));
    const { body } = await call(post({ url: 'https://example.com/0' }), deps(fetchImpl));
    expect(body).toEqual({ ok: false, error: 'fetch_failed' });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it.each([
    [{ url: 'http://localhost/' }, 400, 'invalid_url'],
    [{ url: 42 }, 400, 'invalid_url'],
    ['not json', 400, 'bad_request'],
  ])('rejects bad input %j', async (input, status, error) => {
    const fetchImpl = vi.fn();
    const result = await call(post(input), deps(fetchImpl));
    expect(result.status).toBe(status);
    expect(result.body).toEqual({ ok: false, error });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects non-POST requests', async () => {
    const response = await handleImport(new Request('https://cartcraft.test/api/import'), deps(vi.fn()));
    expect(response.status).toBe(405);
  });

  it('rate limits by client IP', async () => {
    const allow = vi.fn(() => false);
    const result = await call(post({ url: 'https://example.com/t' }), deps(vi.fn(), { allow }));
    expect(result.status).toBe(429);
    expect(result.body).toEqual({ ok: false, error: 'rate_limited' });
    expect(allow).toHaveBeenCalledWith('203.0.113.9', 0);
  });

  it('waits for an async rate limiter', async () => {
    const result = await call(post({ url: 'https://example.com/t' }), deps(vi.fn(), { allow: async () => false }));
    expect(result.status).toBe(429);
  });

  it.each([
    [() => html('denied', { status: 403 }), 'blocked'],
    [() => html('challenge', { status: 200, headers: { 'cf-mitigated': 'challenge', 'content-type': 'text/html' } }), 'blocked'],
    [() => html('gone', { status: 404 }), 'fetch_failed'],
    [() => new Response('{}', { headers: { 'content-type': 'application/json' } }), 'no_recipe_data'],
    [() => html('<html><body>No structured data</body></html>'), 'no_recipe_data'],
    [() => html('x', { headers: { 'content-type': 'text/html', 'content-length': String(IMPORT_LIMITS.maxBytes + 1) } }), 'too_large'],
  ])('maps upstream responses to errors (%#)', async (upstream, error) => {
    const { body } = await call(post({ url: 'https://example.com/t' }), deps(async () => upstream()));
    expect(body).toEqual({ ok: false, error });
  });

  it('maps a streamed size overflow to too_large', async () => {
    const jsonLdBlocks = async () => {
      throw new TooLargeError();
    };
    const { body } = await call(post({ url: 'https://example.com/t' }), deps(async () => html(RECIPE_PAGE), { jsonLdBlocks }));
    expect(body).toEqual({ ok: false, error: 'too_large' });
  });

  it('maps a timeout to timeout', async () => {
    const fetchImpl = (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    const { body } = await call(post({ url: 'https://example.com/slow' }), deps(fetchImpl), { ...IMPORT_LIMITS, timeoutMs: 10 });
    expect(body).toEqual({ ok: false, error: 'timeout' });
  });

  it('maps network failures to fetch_failed', async () => {
    const fetchImpl = async (): Promise<Response> => {
      throw new TypeError('network');
    };
    const { body } = await call(post({ url: 'https://example.com/t' }), deps(fetchImpl));
    expect(body).toEqual({ ok: false, error: 'fetch_failed' });
  });
});

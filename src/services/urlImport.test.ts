import { describe, expect, it, vi } from 'vitest';
import { fetchPageText, importRecipeFromUrl, looksLikeUrl } from './urlImport';

const respond = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe('looksLikeUrl', () => {
  it.each([
    ['https://example.com/tacos', true],
    ['  http://example.com/a?b=1  ', true],
    ['2 cups flour', false],
    ['https://example.com/a\n2 cups flour', false],
    ['example.com/tacos', false],
  ])('%j -> %s', (text, expected) => {
    expect(looksLikeUrl(text)).toBe(expected);
  });
});

describe('importRecipeFromUrl', () => {
  it('posts the trimmed url and returns the recipe', async () => {
    const fetchImpl = respond({ ok: true, mode: 'recipe', recipe: { title: 'Tacos', ingredients: ['1 lb beef'], servings: 4, sourceUrl: 'https://example.com/t' } });
    const result = await importRecipeFromUrl(' https://example.com/t ', fetchImpl);
    expect(result).toEqual({ ok: true, recipe: { title: 'Tacos', ingredients: ['1 lb beef'], servings: 4, sourceUrl: 'https://example.com/t' } });
    expect(fetchImpl).toHaveBeenCalledWith('/api/import', expect.objectContaining({ method: 'POST', body: JSON.stringify({ url: 'https://example.com/t' }) }));
  });

  it('keeps method steps', async () => {
    const steps = [{ text: 'Crispy onions', isHeader: true }, { text: 'Fry the onion.', isHeader: false }];
    const fetchImpl = respond({ ok: true, mode: 'recipe', recipe: { title: 'Tacos', ingredients: ['1 onion'], steps, sourceUrl: 'https://example.com/t' } });
    const result = await importRecipeFromUrl('https://example.com/t', fetchImpl);
    expect(result).toEqual({ ok: true, recipe: { title: 'Tacos', ingredients: ['1 onion'], steps, sourceUrl: 'https://example.com/t' } });
  });

  it('passes through known errors', async () => {
    expect(await importRecipeFromUrl('https://x.com', respond({ ok: false, error: 'blocked' }))).toEqual({ ok: false, error: 'blocked' });
    expect(await importRecipeFromUrl('https://x.com', respond({ ok: false, error: 'rate_limited' }, 429))).toEqual({ ok: false, error: 'rate_limited' });
  });

  it('treats malformed responses and network errors as fetch_failed', async () => {
    expect(await importRecipeFromUrl('https://x.com', respond({ ok: true, recipe: 'nope' }))).toEqual({ ok: false, error: 'fetch_failed' });
    expect(await importRecipeFromUrl('https://x.com', vi.fn(async () => new Response('<html>', { status: 502 })))).toEqual({ ok: false, error: 'fetch_failed' });
    expect(await importRecipeFromUrl('https://x.com', vi.fn(async () => { throw new TypeError('offline'); }))).toEqual({ ok: false, error: 'fetch_failed' });
  });

  it('times out', async () => {
    const hang = (_input: string, init: RequestInit) =>
      new Promise<Response>((_r, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
    expect(await importRecipeFromUrl('https://x.com', hang, 10)).toEqual({ ok: false, error: 'timeout' });
  });
});

describe('fetchPageText', () => {
  it('asks for text mode and returns the text', async () => {
    const fetchImpl = respond({ ok: true, mode: 'text', text: '2 cups flour', sourceUrl: 'https://x.com/a' });
    expect(await fetchPageText('https://x.com/a', fetchImpl)).toEqual({ ok: true, text: '2 cups flour', sourceUrl: 'https://x.com/a' });
    expect(fetchImpl).toHaveBeenCalledWith('/api/import', expect.objectContaining({ body: JSON.stringify({ url: 'https://x.com/a', mode: 'text' }) }));
  });
});

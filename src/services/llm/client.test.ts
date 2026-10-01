import { describe, expect, it, vi } from 'vitest';
import { getProvider, providerOrigins, PROVIDERS } from '../providers';
import { LlmError, chatJson, type LlmConfig } from './client';

const deepseek: LlmConfig = { provider: getProvider('deepseek'), model: '', apiKey: 'sk-test' };
const request = { system: 'Answer in JSON.', user: 'hi', maxTokens: 100 };

function reply(content: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status }));
}

async function kindOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'none';
  } catch (err) {
    return err instanceof LlmError ? err.kind : 'other';
  }
}

describe('providers', () => {
  it('has four providers and falls back to the first for unknown ids', () => {
    expect(PROVIDERS.map((p) => p.id)).toEqual(['deepseek', 'openrouter', 'openai', 'groq']);
    expect(getProvider('nope').id).toBe('deepseek');
  });

  it('lists origins for the CSP', () => {
    expect(providerOrigins()).toEqual(['https://api.deepseek.com', 'https://openrouter.ai', 'https://api.openai.com', 'https://api.groq.com']);
  });
});

describe('chatJson', () => {
  it('sends an OpenAI-compatible JSON-mode request and parses the reply', async () => {
    const fetchImpl = reply('{"ok":true}');
    expect(await chatJson(deepseek, request, fetchImpl)).toEqual({ ok: true });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.deepseek.com/chat/completions');
    expect(init.headers).toEqual({ Authorization: 'Bearer sk-test', 'Content-Type': 'application/json' });
    expect(JSON.parse(String(init.body))).toEqual({
      model: 'deepseek-flash',
      messages: [{ role: 'system', content: 'Answer in JSON.' }, { role: 'user', content: 'hi' }],
      response_format: { type: 'json_object' },
      max_tokens: 100,
      stream: false,
      temperature: 0.2,
    });
  });

  it('uses the provider token parameter and omits temperature where unsupported', async () => {
    const fetchImpl = reply('{}');
    await chatJson({ provider: getProvider('openai'), model: 'custom-model', apiKey: 'k' }, request, fetchImpl);
    const body = JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.model).toBe('custom-model');
    expect(body.max_completion_tokens).toBe(100);
    expect(body).not.toHaveProperty('max_tokens');
    expect(body).not.toHaveProperty('temperature');
  });

  it('accepts JSON wrapped in a code fence', async () => {
    expect(await chatJson(deepseek, request, reply('```json\n{"a":1}\n```'))).toEqual({ a: 1 });
  });

  it.each([
    [401, 'auth'],
    [403, 'auth'],
    [402, 'billing'],
    [429, 'rate_limited'],
    [500, 'server'],
    [400, 'bad_response'],
  ])('maps HTTP %d to %s', async (status, kind) => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status }));
    expect(await kindOf(chatJson(deepseek, request, fetchImpl))).toBe(kind);
  });

  it.each([
    ['empty content', reply('')],
    ['non-JSON content', reply('Sure! Here you go')],
    ['missing choices', vi.fn(async () => new Response('{}'))],
    ['non-JSON body', vi.fn(async () => new Response('<html>'))],
  ])('treats %s as bad_response', async (_name, fetchImpl) => {
    expect(await kindOf(chatJson(deepseek, request, fetchImpl))).toBe('bad_response');
  });

  it('maps network errors and timeouts', async () => {
    expect(await kindOf(chatJson(deepseek, request, vi.fn(async () => { throw new TypeError('offline'); })))).toBe('network');
    const hang = (_input: string, init: RequestInit) =>
      new Promise<Response>((_r, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
    expect(await kindOf(chatJson(deepseek, request, hang, 10))).toBe('timeout');
  });

  it('never puts the key in error messages', async () => {
    try {
      await chatJson(deepseek, request, vi.fn(async () => new Response('{}', { status: 401 })));
    } catch (err) {
      expect(String((err as Error).message)).not.toContain('sk-test');
    }
  });
});

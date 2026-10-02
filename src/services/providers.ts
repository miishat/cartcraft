/**
 * OpenAI-compatible providers the app may call from the browser. This list is also the
 * source for the CSP connect-src allowlist (Plan 5), so adding a provider is one entry here.
 * All four answered a browser CORS preflight on 2026-10-01.
 */
export interface Provider {
  id: string;
  name: string;
  /** `${baseUrl}/chat/completions` is the endpoint. */
  baseUrl: string;
  /** Cheap model suited to extraction; the user can type another. Checked 2026-10-01. */
  defaultModel: string;
  /** Newer OpenAI-style APIs reject max_tokens in favor of max_completion_tokens. */
  tokenParam: 'max_tokens' | 'max_completion_tokens';
  /** Reasoning models reject a custom temperature. */
  sendTemperature: boolean;
}

export const PROVIDERS: readonly Provider[] = [
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', defaultModel: 'deepseek-flash', tokenParam: 'max_tokens', sendTemperature: true },
  { id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', defaultModel: 'deepseek/deepseek-v4.1-flash', tokenParam: 'max_tokens', sendTemperature: true },
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-6-luna', tokenParam: 'max_completion_tokens', sendTemperature: false },
  { id: 'groq', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', defaultModel: 'openai/gpt-oss-20b', tokenParam: 'max_completion_tokens', sendTemperature: true },
];

/** Unknown ids (for example from an old backup) fall back to the first provider. */
export function getProvider(id: string): Provider {
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0]!;
}

/** Origins the browser may contact for AI requests (for the CSP connect-src directive). */
export function providerOrigins(): string[] {
  return [...new Set(PROVIDERS.map((p) => new URL(p.baseUrl).origin))];
}

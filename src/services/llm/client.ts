import { UserFacingError } from '../../app/errors';
import type { Provider } from '../providers';

export type LlmErrorKind =
  | 'auth' | 'billing' | 'rate_limited' | 'timeout' | 'network' | 'server' | 'rejected' | 'truncated' | 'bad_response';

const MESSAGES: Record<LlmErrorKind, string> = {
  auth: 'The AI provider rejected the key. Check it in Settings.',
  billing: 'The AI provider says the account has no credit left.',
  rate_limited: 'The AI provider is rate limiting requests. Wait a moment and try again.',
  timeout: 'The AI took too long to answer. Try again.',
  network: 'Could not reach the AI provider. Check your connection.',
  server: 'The AI provider had a problem. Try again later.',
  rejected: 'The AI provider rejected the request. Check the model name in Settings.',
  truncated: 'The AI ran out of room before it finished. Try again.',
  bad_response: "The AI didn't return usable data. Try again, or continue without it.",
};

/** Every failure from an AI call. The message is safe to show; the key is never included. */
export class LlmError extends UserFacingError {
  constructor(readonly kind: LlmErrorKind) {
    super(MESSAGES[kind]);
  }
}

export interface LlmConfig {
  provider: Provider;
  model: string;
  apiKey: string;
}

export interface ChatJsonRequest {
  system: string;
  user: string;
  maxTokens: number;
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

function statusError(status: number): LlmErrorKind {
  if (status === 401 || status === 403) return 'auth';
  if (status === 402) return 'billing';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'server';
  if (status === 400 || status === 404 || status === 422) return 'rejected';
  return 'bad_response';
}

/** Parses the reply, tolerating a code fence or a sentence before and after the object. */
function extractJson(content: string): unknown {
  const text = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) throw new SyntaxError('No JSON object');
    return JSON.parse(text.slice(start, end + 1));
  }
}

/**
 * One non-streaming chat completion in JSON mode. Returns the parsed JSON object from the
 * reply; the caller validates its shape. No retries: one call per user action.
 */
export async function chatJson(
  config: LlmConfig,
  request: ChatJsonRequest,
  fetchImpl: FetchLike = (input, init) => fetch(input, init),
  timeoutMs = 45_000,
): Promise<unknown> {
  const { provider, model, apiKey } = config;
  const body: Record<string, unknown> = {
    model: model || provider.defaultModel,
    messages: [
      { role: 'system', content: request.system },
      { role: 'user', content: request.user },
    ],
    response_format: { type: 'json_object' },
    [provider.tokenParam]: request.maxTokens,
    stream: false,
  };
  if (provider.sendTemperature) body.temperature = 0.2;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let payload: unknown;
  try {
    let response: Response;
    try {
      response = await fetchImpl(`${provider.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      throw new LlmError(controller.signal.aborted ? 'timeout' : 'network');
    }
    if (!response.ok) throw new LlmError(statusError(response.status));
    try {
      payload = await response.json();
    } catch {
      throw new LlmError(controller.signal.aborted ? 'timeout' : 'bad_response');
    }
  } finally {
    clearTimeout(timer);
  }
  const choice = (payload as { choices?: { message?: { content?: unknown }; finish_reason?: unknown }[] })?.choices?.[0];
  const content = choice?.message?.content;
  const cutOff = choice?.finish_reason === 'length';
  if (typeof content !== 'string' || !content.trim()) throw new LlmError(cutOff ? 'truncated' : 'bad_response');
  try {
    return extractJson(content);
  } catch {
    throw new LlmError(cutOff ? 'truncated' : 'bad_response');
  }
}

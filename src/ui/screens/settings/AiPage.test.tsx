// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveAiKey } from '../../../app/ai';
import { exportBackup, serializeBackup } from '../../../data/backup';
import { getSettings } from '../../../data/db';
import { createTestDb } from '../../../test/db';
import { renderRoutes } from '../../../test/render';
import { AiPage } from './AiPage';

const routes = [{ path: '/settings/ai', element: <AiPage /> }];

function stubProvider(content: unknown, status = 200) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AI helper page', () => {
  it('saves provider and model, and saves the key without exporting it', async () => {
    const { user, db } = renderRoutes(routes, '/settings/ai');
    expect(screen.getByRole('heading', { level: 1, name: 'AI Helper' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Provider' })).toBeInTheDocument();
    await user.click(await screen.findByRole('radio', { name: 'OpenRouter' }));
    await waitFor(async () => expect((await getSettings(db)).llm.providerId).toBe('openrouter'));
    expect(screen.getByRole('radio', { name: 'OpenRouter' })).toBeChecked();

    const model = screen.getByLabelText('Model');
    await waitFor(() => expect(model).toHaveAttribute('placeholder', 'deepseek/deepseek-v4.1-flash'));
    await user.type(model, 'qwen/qwen3.7-flash');
    await user.tab();
    await waitFor(async () => expect((await getSettings(db)).llm.model).toBe('qwen/qwen3.7-flash'));

    await user.type(screen.getByLabelText('API key'), 'sk-secret-123');
    await user.click(screen.getByRole('button', { name: 'Save key' }));
    expect(await screen.findByText('Key saved for OpenRouter.')).toBeInTheDocument();
    expect((await db.secrets.get('secrets'))?.llmApiKey).toBe('sk-secret-123');
    expect(serializeBackup(await exportBackup(db, 1))).not.toContain('sk-secret-123');
  });

  it('removes a saved key', async () => {
    const db = createTestDb();
    await saveAiKey(db, 'sk-old');
    const { user } = renderRoutes(routes, '/settings/ai', db);
    await user.click(await screen.findByRole('button', { name: 'Remove key' }));
    expect(await screen.findByLabelText('API key')).toBeInTheDocument();
    expect(await db.secrets.get('secrets')).toBeUndefined();
  });

  it('tests the connection with the typed key before saving it', async () => {
    const fetchMock = stubProvider({ ok: true });
    const { user, db } = renderRoutes(routes, '/settings/ai');
    await user.type(await screen.findByLabelText('API key'), 'sk-try');
    await user.click(screen.getByRole('button', { name: 'Test connection' }));
    expect(await screen.findByText('Connection works.')).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.deepseek.com/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-try');
    expect(await db.secrets.get('secrets')).toBeUndefined();
  });

  it('shows which provider the key is for and refuses it for another provider', async () => {
    const fetchMock = stubProvider({ ok: true });
    const db = createTestDb();
    await saveAiKey(db, 'sk-ds');
    const { user } = renderRoutes(routes, '/settings/ai', db);
    expect(await screen.findByText('Key saved for DeepSeek.')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'OpenAI' }));
    expect(await screen.findByText(/will not be used with OpenAI/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Test connection' })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('clears the connection message when the provider changes', async () => {
    stubProvider({ ok: true });
    const { user } = renderRoutes(routes, '/settings/ai');
    await user.type(await screen.findByLabelText('API key'), 'sk-try');
    await user.click(screen.getByRole('button', { name: 'Test connection' }));
    expect(await screen.findByText('Connection works.')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Groq' }));
    await waitFor(() => expect(screen.queryByText('Connection works.')).not.toBeInTheDocument());
  });

  it('explains a rejected key', async () => {
    stubProvider({}, 401);
    const db = createTestDb();
    await saveAiKey(db, 'sk-bad');
    const { user } = renderRoutes(routes, '/settings/ai', db);
    await user.click(await screen.findByRole('button', { name: 'Test connection' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The AI provider rejected the key. Check it in Settings.');
  });
});

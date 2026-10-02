// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveAiKey } from '../../app/ai';
import { exportBackup, serializeBackup } from '../../data/backup';
import { getSettings } from '../../data/db';
import { createTestDb } from '../../test/db';
import { renderRoutes } from '../../test/render';
import { SettingsScreen } from './SettingsScreen';

const routes = [{ path: '/settings', element: <SettingsScreen now={() => 1} /> }];

function stubProvider(content: unknown, status = 200) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SettingsScreen: AI helper', () => {
  it('saves provider and model, and saves the key without exporting it', async () => {
    const { user, db } = renderRoutes(routes, '/settings');
    const section = await screen.findByRole('region', { name: 'AI helper' });
    await user.selectOptions(within(section).getByLabelText('Provider'), 'openrouter');
    await waitFor(async () => expect((await getSettings(db)).llm.providerId).toBe('openrouter'));

    const model = within(section).getByLabelText('Model');
    expect(model).toHaveAttribute('placeholder', 'deepseek/deepseek-v4.1-flash');
    await user.type(model, 'qwen/qwen3.7-flash');
    await user.tab();
    await waitFor(async () => expect((await getSettings(db)).llm.model).toBe('qwen/qwen3.7-flash'));

    await user.type(within(section).getByLabelText('API key'), 'sk-secret-123');
    await user.click(within(section).getByRole('button', { name: 'Save key' }));
    expect(await within(section).findByText('Key saved for OpenRouter.')).toBeInTheDocument();
    expect((await db.secrets.get('secrets'))?.llmApiKey).toBe('sk-secret-123');
    expect(serializeBackup(await exportBackup(db, 1))).not.toContain('sk-secret-123');
  });

  it('removes a saved key', async () => {
    const db = createTestDb();
    await saveAiKey(db, 'sk-old');
    const { user } = renderRoutes(routes, '/settings', db);
    await user.click(await screen.findByRole('button', { name: 'Remove key' }));
    expect(await screen.findByLabelText('API key')).toBeInTheDocument();
    expect(await db.secrets.get('secrets')).toBeUndefined();
  });

  it('tests the connection with the typed key before saving it', async () => {
    const fetchMock = stubProvider({ ok: true });
    const { user, db } = renderRoutes(routes, '/settings');
    const section = await screen.findByRole('region', { name: 'AI helper' });
    await user.type(within(section).getByLabelText('API key'), 'sk-try');
    await user.click(within(section).getByRole('button', { name: 'Test connection' }));
    expect(await within(section).findByText('Connection works.')).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.deepseek.com/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-try');
    expect(await db.secrets.get('secrets')).toBeUndefined();
  });

  it('shows which provider the key is for and refuses it for another provider', async () => {
    const fetchMock = stubProvider({ ok: true });
    const db = createTestDb();
    await saveAiKey(db, 'sk-ds');
    const { user } = renderRoutes(routes, '/settings', db);
    const section = await screen.findByRole('region', { name: 'AI helper' });
    expect(await within(section).findByText('Key saved for DeepSeek.')).toBeInTheDocument();
    await user.selectOptions(within(section).getByLabelText('Provider'), 'openai');
    expect(await within(section).findByText(/will not be used with OpenAI/)).toBeInTheDocument();
    expect(within(section).getByRole('button', { name: 'Test connection' })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('clears the connection message when the provider changes', async () => {
    stubProvider({ ok: true });
    const { user } = renderRoutes(routes, '/settings');
    const section = await screen.findByRole('region', { name: 'AI helper' });
    await user.type(within(section).getByLabelText('API key'), 'sk-try');
    await user.click(within(section).getByRole('button', { name: 'Test connection' }));
    expect(await within(section).findByText('Connection works.')).toBeInTheDocument();
    await user.selectOptions(within(section).getByLabelText('Provider'), 'groq');
    await waitFor(() => expect(within(section).queryByText('Connection works.')).not.toBeInTheDocument());
  });

  it('explains a rejected key', async () => {
    stubProvider({}, 401);
    const db = createTestDb();
    await saveAiKey(db, 'sk-bad');
    const { user } = renderRoutes(routes, '/settings', db);
    const section = await screen.findByRole('region', { name: 'AI helper' });
    await user.click(await within(section).findByRole('button', { name: 'Test connection' }));
    expect(await within(section).findByRole('alert')).toHaveTextContent('The AI provider rejected the key. Check it in Settings.');
  });
});

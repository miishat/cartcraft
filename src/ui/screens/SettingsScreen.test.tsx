// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { saveAiKey } from '../../app/ai';
import { createTestDb } from '../../test/db';
import { renderRoutes } from '../../test/render';
import { SettingsScreen } from './SettingsScreen';

const routes = [{ path: '/settings', element: <SettingsScreen /> }];

describe('Settings home', () => {
  it('shows the title and the app version', async () => {
    renderRoutes(routes, '/settings');
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    expect(await screen.findByText('CartCraft test')).toBeInTheDocument();
  });

  it('links every row to its page', async () => {
    renderRoutes(routes, '/settings');
    const pages: [RegExp, string][] = [
      [/^Appearance/, '/settings/appearance'],
      [/^Units/, '/settings/units'],
      [/^Default Servings/, '/settings/servings'],
      [/^Aisles/, '/settings/aisles'],
      [/^Pantry Staples/, '/settings/pantry'],
      [/^AI Helper/, '/settings/ai'],
      [/^Backup & Restore/, '/settings/backup'],
      [/^Storage/, '/settings/storage'],
    ];
    for (const [name, href] of pages) expect(await screen.findByRole('link', { name })).toHaveAttribute('href', href);
  });

  it('summarises the current settings on the rows', async () => {
    const db = createTestDb();
    await saveAiKey(db, 'sk-test');
    renderRoutes(routes, '/settings', db);
    expect(await screen.findByRole('link', { name: /^Appearance/ })).toHaveTextContent('Basil, System');
    expect(screen.getByRole('link', { name: /^Units/ })).toHaveTextContent('US');
    expect(await screen.findByRole('link', { name: /^Default Servings/ })).toHaveTextContent('4');
    expect(await screen.findByRole('link', { name: /^Aisles/ })).toHaveTextContent('11 aisles, your store order');
    expect(await screen.findByRole('link', { name: /^Pantry Staples/ })).toHaveTextContent('black pepper, olive oil, salt +2');
    expect(await screen.findByRole('link', { name: /^AI Helper/ })).toHaveTextContent('DeepSeek, key saved');
  });

  it('says AI is off without a key and groups the rows', async () => {
    renderRoutes(routes, '/settings');
    await waitFor(() => expect(screen.getByRole('link', { name: /^AI Helper/ })).toHaveTextContent('Off'));
    const data = screen.getByRole('region', { name: 'Your data' });
    expect(within(data).getByRole('link', { name: /^Backup & Restore/ })).toBeInTheDocument();
  });
});

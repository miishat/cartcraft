// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { draftLinesFromText, saveRecipe } from '../../app/recipes';
import { exportBackup, serializeBackup } from '../../data/backup';
import { createTestDb, sequentialIds } from '../../test/db';
import { renderRoutes } from '../../test/render';
import { SettingsScreen } from './SettingsScreen';

const routes = [{ path: '/settings', element: <SettingsScreen now={() => Date.UTC(2026, 9, 1)} /> }];

async function backupText(): Promise<string> {
  const source = createTestDb();
  const ids = sequentialIds('r');
  await saveRecipe(source, { title: 'Soup', rawText: '1 onion', baseServings: 2, ingredients: draftLinesFromText('1 onion', ids) }, 1, ids);
  return serializeBackup(await exportBackup(source, 1));
}

describe('SettingsScreen error handling', () => {
  it('reports a failed import and leaves data unchanged', async () => {
    const text = await backupText();
    const { user, db } = renderRoutes(routes, '/settings');
    await user.click(await screen.findByRole('button', { name: 'Paste' }));
    await user.click(screen.getByLabelText('Paste backup'));
    await user.paste(text);
    await user.click(screen.getByRole('button', { name: 'Check' }));
    vi.spyOn(db.snapshots, 'put').mockRejectedValueOnce(new Error('quota'));
    const confirm = await screen.findByRole('button', { name: 'Replace my data' });
    await user.click(confirm);
    expect(await screen.findByText('Import failed. Your data was not changed.')).toBeInTheDocument();
    expect(await db.recipes.count()).toBe(0);
  });

  it('reports a failed setting change next to the control', async () => {
    const { user, db } = renderRoutes(routes, '/settings');
    vi.spyOn(db.settings, 'put').mockRejectedValueOnce(new Error('disk'));
    await user.click(await screen.findByLabelText('Metric (ml, g, kg)'));
    const section = screen.getByRole('region', { name: 'Units and servings' });
    expect(await within(section).findByRole('alert')).toHaveTextContent('Could not save that setting. Try again.');
  });

  it('restores the aisle name when it is cleared', async () => {
    const { user, db } = renderRoutes(routes, '/settings');
    const name = await screen.findByLabelText('Name of Produce');
    await user.clear(name);
    await user.tab();
    expect(name).toHaveValue('Produce');
    expect((await db.aisles.get('produce'))?.name).toBe('Produce');
  });

  it('accepts the same file twice in a row', async () => {
    const text = await backupText();
    const { user } = renderRoutes(routes, '/settings');
    const input = (await screen.findByText('Import')).querySelector('input') as HTMLInputElement;
    const file = new File([text], 'backup.json', { type: 'application/json' });
    await user.upload(input, file);
    expect(await screen.findByRole('button', { name: 'Replace my data' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(input.value).toBe('');
    await user.upload(input, file);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Replace my data' })).toBeInTheDocument());
  });
});

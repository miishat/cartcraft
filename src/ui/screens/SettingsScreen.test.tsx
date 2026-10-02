// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { draftLinesFromText, saveRecipe } from '../../app/recipes';
import { exportBackup, MAX_BACKUP_BYTES, serializeBackup } from '../../data/backup';
import { getSettings } from '../../data/db';
import { createTestDb, sequentialIds } from '../../test/db';
import { renderRoutes } from '../../test/render';
import { SettingsScreen } from './SettingsScreen';

const routes = [{ path: '/settings', element: <SettingsScreen now={() => Date.UTC(2026, 9, 1)} /> }];

describe('SettingsScreen', () => {
  it('shows the app version', async () => {
    renderRoutes(routes, '/settings');
    expect(await screen.findByText('CartCraft version test')).toBeInTheDocument();
  });

  it('switches the theme and remembers it on this device', async () => {
    const { user } = renderRoutes(routes, '/settings');
    await user.click(await screen.findByRole('radio', { name: 'Dark' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('cartcraft-theme')).toBe('dark');
    await user.click(screen.getByRole('radio', { name: 'Match my device' }));
    expect(localStorage.getItem('cartcraft-theme')).toBeNull();
    delete document.documentElement.dataset.theme;
  });

  it('saves the unit system and default servings', async () => {
    const { user, db } = renderRoutes(routes, '/settings');
    await user.click(await screen.findByLabelText('Metric (ml, g, kg)'));
    await waitFor(async () => expect((await getSettings(db)).unitSystem).toBe('metric'));
    const servings = screen.getByLabelText('Default servings');
    await user.clear(servings);
    await user.type(servings, '6');
    await waitFor(async () => expect((await getSettings(db)).defaultServings).toBe(6));
  });

  it('adds and removes pantry staples', async () => {
    const { user, db } = renderRoutes(routes, '/settings');
    await user.type(await screen.findByLabelText('New pantry staple'), 'Garlic Powder');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('garlic powder')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove garlic powder' }));
    await waitFor(async () => expect(await db.pantryStaples.get('garlic powder')).toBeUndefined());
  });

  it('reorders and renames aisles', async () => {
    const { user, db } = renderRoutes(routes, '/settings');
    await user.click(await screen.findByRole('button', { name: 'Move Meat & Seafood up' }));
    await waitFor(async () => expect((await db.aisles.orderBy('order').first())?.id).toBe('meat-seafood'));
    const name = screen.getByLabelText('Name of Produce');
    await user.clear(name);
    await user.type(name, 'Fruit & Veg');
    await user.tab();
    await waitFor(async () => expect((await db.aisles.get('produce'))?.name).toBe('Fruit & Veg'));
  });

  it('exports a backup file', async () => {
    const createObjectURL = vi.fn(() => 'blob:backup');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const { user } = renderRoutes(routes, '/settings');
    await user.click(await screen.findByRole('button', { name: 'Export' }));
    expect(await screen.findByText('Backup downloaded.')).toBeInTheDocument();
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('hides Share when the browser cannot share files', async () => {
    renderRoutes(routes, '/settings');
    await screen.findByRole('button', { name: 'Export' });
    expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument();
  });

  it('shares the backup as a text file when supported', async () => {
    const share = vi.fn(async () => undefined);
    Object.assign(navigator, { share, canShare: () => true });
    const { user } = renderRoutes(routes, '/settings');
    await user.click(await screen.findByRole('button', { name: 'Share' }));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const [{ files }] = share.mock.calls[0] as unknown as [{ files: File[] }];
    expect(files[0]?.name).toBe('cartcraft-backup-2026-10-01.txt');
    expect(files[0]?.type).toBe('text/plain');
    Reflect.deleteProperty(navigator, 'share');
    Reflect.deleteProperty(navigator, 'canShare');
  });

  it('imports a pasted backup after confirmation and can undo', async () => {
    const source = createTestDb();
    const ids = sequentialIds('r');
    await saveRecipe(source, { title: 'Soup', rawText: '1 onion', baseServings: 2, ingredients: draftLinesFromText('1 onion', ids) }, 1, ids);
    const text = serializeBackup(await exportBackup(source, 1));

    const { user, db } = renderRoutes(routes, '/settings');
    await user.click(await screen.findByRole('button', { name: 'Paste' }));
    await user.click(screen.getByLabelText('Paste backup'));
    await user.paste(text);
    await user.click(screen.getByRole('button', { name: 'Check' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('This backup has 1 recipes, 0 lists');
    await user.click(within(alert).getByRole('button', { name: 'Replace my data' }));
    await waitFor(async () => expect(await db.recipes.count()).toBe(1));

    await user.click(await screen.findByRole('button', { name: 'Undo last import' }));
    await waitFor(async () => expect(await db.recipes.count()).toBe(0));
    expect(await screen.findByText('Previous data restored.')).toBeInTheDocument();
  });

  it('explains a rejected backup', async () => {
    const { user } = renderRoutes(routes, '/settings');
    await user.click(await screen.findByRole('button', { name: 'Paste' }));
    await user.type(screen.getByLabelText('Paste backup'), 'hello');
    await user.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByText('That is not a valid backup file (not JSON).')).toBeInTheDocument();
  });

  it('rejects an oversized file by its size without reading it', async () => {
    const { user } = renderRoutes(routes, '/settings');
    const input = (await screen.findByText('Import')).querySelector('input') as HTMLInputElement;
    const big = new File(['x'], 'big.json', { type: 'application/json' });
    Object.defineProperty(big, 'size', { value: MAX_BACKUP_BYTES + 1 });
    const text = vi.fn(async () => 'x');
    Object.defineProperty(big, 'text', { value: text });
    await user.upload(input, big);
    expect(await screen.findByText('That file is too large to be a CartCraft backup.')).toBeInTheDocument();
    expect(text).not.toHaveBeenCalled();
  });
});

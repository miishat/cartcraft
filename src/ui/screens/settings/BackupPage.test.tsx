// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { draftLinesFromText, saveRecipe } from '../../../app/recipes';
import { exportBackup, MAX_BACKUP_BYTES, serializeBackup } from '../../../data/backup';
import { createTestDb, sequentialIds } from '../../../test/db';
import { renderRoutes } from '../../../test/render';
import { BackupPage } from './BackupPage';

const routes = [{ path: '/settings/backup', element: <BackupPage now={() => Date.UTC(2026, 9, 1)} /> }];

async function backupText(): Promise<string> {
  const source = createTestDb();
  const ids = sequentialIds('r');
  await saveRecipe(source, { title: 'Soup', rawText: '1 onion', baseServings: 2, ingredients: draftLinesFromText('1 onion', ids) }, 1, ids);
  return serializeBackup(await exportBackup(source, 1));
}

describe('Backup and restore page', () => {
  it('exports a backup file', async () => {
    const createObjectURL = vi.fn(() => 'blob:backup');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const { user } = renderRoutes(routes, '/settings/backup');
    await user.click(await screen.findByRole('button', { name: /^Export backup/ }));
    expect(await screen.findByText('Backup downloaded.')).toBeInTheDocument();
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
    click.mockRestore();
  });

  it('shows inset focus rings on the action button and the import label', async () => {
    renderRoutes(routes, '/settings/backup');
    const button = await screen.findByRole('button', { name: /^Export backup/ });
    expect(button).toHaveClass('focus-visible:ring-2', 'focus-visible:ring-inset', 'focus-visible:ring-emerald-600');
    const label = (await screen.findByLabelText('Import from file')).closest('label');
    expect(label).toHaveClass('has-[:focus-visible]:ring-2', 'has-[:focus-visible]:ring-inset', 'has-[:focus-visible]:ring-emerald-600');
  });

  it('hides Share when the browser cannot share files', async () => {
    renderRoutes(routes, '/settings/backup');
    await screen.findByRole('button', { name: /^Export backup/ });
    expect(screen.queryByRole('button', { name: /^Share backup/ })).not.toBeInTheDocument();
  });

  it('shares the backup as a text file when supported', async () => {
    const share = vi.fn(async () => undefined);
    Object.assign(navigator, { share, canShare: () => true });
    const { user } = renderRoutes(routes, '/settings/backup');
    await user.click(await screen.findByRole('button', { name: /^Share backup/ }));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const [{ files }] = share.mock.calls[0] as unknown as [{ files: File[] }];
    expect(files[0]?.name).toBe('cartcraft-backup-2026-10-01.txt');
    expect(files[0]?.type).toBe('text/plain');
    Reflect.deleteProperty(navigator, 'share');
    Reflect.deleteProperty(navigator, 'canShare');
  });

  it('imports a pasted backup after confirmation and can undo', async () => {
    const text = await backupText();
    const { user, db } = renderRoutes(routes, '/settings/backup');
    const paste = await screen.findByRole('button', { name: 'Paste a backup' });
    expect(paste).toHaveAttribute('aria-expanded', 'false');
    await user.click(paste);
    expect(paste).toHaveAttribute('aria-expanded', 'true');
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
    const { user } = renderRoutes(routes, '/settings/backup');
    await user.click(await screen.findByRole('button', { name: 'Paste a backup' }));
    await user.type(screen.getByLabelText('Paste backup'), 'hello');
    await user.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByText('That is not a valid backup file (not JSON).')).toBeInTheDocument();
  });

  it('reports a failed import and leaves data unchanged', async () => {
    const text = await backupText();
    const { user, db } = renderRoutes(routes, '/settings/backup');
    await user.click(await screen.findByRole('button', { name: 'Paste a backup' }));
    await user.click(screen.getByLabelText('Paste backup'));
    await user.paste(text);
    await user.click(screen.getByRole('button', { name: 'Check' }));
    vi.spyOn(db.snapshots, 'put').mockRejectedValueOnce(new Error('quota'));
    await user.click(await screen.findByRole('button', { name: 'Replace my data' }));
    expect(await screen.findByText('Import failed. Your data was not changed.')).toBeInTheDocument();
    expect(await db.recipes.count()).toBe(0);
  });

  it('rejects an oversized file by its size without reading it', async () => {
    const { user } = renderRoutes(routes, '/settings/backup');
    const input = await screen.findByLabelText('Import from file');
    const big = new File(['x'], 'big.json', { type: 'application/json' });
    Object.defineProperty(big, 'size', { value: MAX_BACKUP_BYTES + 1 });
    const text = vi.fn(async () => 'x');
    Object.defineProperty(big, 'text', { value: text });
    await user.upload(input, big);
    expect(await screen.findByText('That file is too large to be a CartCraft backup.')).toBeInTheDocument();
    expect(text).not.toHaveBeenCalled();
  });

  it('accepts the same file twice in a row', async () => {
    const text = await backupText();
    const { user } = renderRoutes(routes, '/settings/backup');
    const input = (await screen.findByLabelText('Import from file')) as HTMLInputElement;
    const file = new File([text], 'backup.json', { type: 'application/json' });
    await user.upload(input, file);
    expect(await screen.findByRole('button', { name: 'Replace my data' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(input.value).toBe('');
    await user.upload(input, file);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Replace my data' })).toBeInTheDocument());
  });
});

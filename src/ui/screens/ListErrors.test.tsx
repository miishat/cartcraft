// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createList } from '../../app/lists';
import { draftLinesFromText, saveRecipe } from '../../app/recipes';
import type { CartCraftDb } from '../../data/db';
import { createTestDb, sequentialIds } from '../../test/db';
import { renderRoutes } from '../../test/render';
import { ListScreen } from './ListScreen';

async function seededList(): Promise<{ db: CartCraftDb; listId: string }> {
  const db = createTestDb();
  const ids = sequentialIds('s');
  const text = '2 onions, diced\n1 cup milk';
  const recipeId = await saveRecipe(db, { title: 'Soup', rawText: text, baseServings: 4, ingredients: draftLinesFromText(text, ids) }, 1, ids);
  const listId = await createList(db, [{ recipeId, targetServings: 4 }], 1, ids);
  return { db, listId };
}

const routes = [{ path: '/lists/:id', element: <ListScreen makeId={sequentialIds('new')} now={() => 50} undoMs={60_000} copiedMs={50} /> }];

describe('ListScreen fixes and error handling', () => {
  it('keeps notes when an item is edited', async () => {
    const { db, listId } = await seededList();
    const { user } = renderRoutes(routes, `/lists/${listId}`, db);
    await user.click(await screen.findByRole('button', { name: 'Options for onions' }));
    const input = screen.getByLabelText('Edit onions');
    expect(input).toHaveValue('2 onions, diced');
    await user.clear(input);
    await user.type(input, '3 onions, diced');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(async () => {
      const item = (await db.lists.get(listId))!.items.find((i) => i.itemKey === 'onion')!;
      expect(item.notes).toBe('diced');
      expect(item.amounts[0]?.quantity.min).toBe(3);
    });
  });

  it('does not re-save an item whose text did not change', async () => {
    const { db, listId } = await seededList();
    const { user } = renderRoutes(routes, `/lists/${listId}`, db);
    const update = vi.spyOn(db.lists, 'update');
    await user.click(await screen.findByRole('button', { name: 'Options for milk' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(update).not.toHaveBeenCalled();
  });

  it('shows an inline message when a change fails', async () => {
    const { db, listId } = await seededList();
    const { user } = renderRoutes(routes, `/lists/${listId}`, db);
    vi.spyOn(db.lists, 'update').mockRejectedValueOnce(new Error('disk'));
    await user.click(await screen.findByRole('button', { name: 'Milk: 1 cup' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That change did not save. Try again.');
  });

  it('explains a failed copy and clears the copied note after a while', async () => {
    const { db, listId } = await seededList();
    const { user } = renderRoutes(routes, `/lists/${listId}`, db);
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new Error('denied'));
    await user.click(await screen.findByRole('button', { name: 'Copy list as text' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not copy.');

    writeText.mockResolvedValueOnce();
    await user.click(screen.getByRole('button', { name: 'Copy list as text' }));
    expect(await screen.findByText('Copied to clipboard')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Copied to clipboard')).not.toBeInTheDocument());
  });
});

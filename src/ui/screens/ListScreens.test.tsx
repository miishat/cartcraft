// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createList } from '../../app/lists';
import { draftLinesFromText, saveRecipe } from '../../app/recipes';
import type { CartCraftDb } from '../../data/db';
import { createTestDb, sequentialIds } from '../../test/db';
import { renderRoutes } from '../../test/render';
import { ListScreen } from './ListScreen';
import { ListsScreen } from './ListsScreen';

async function seededList(): Promise<{ db: CartCraftDb; listId: string }> {
  const db = createTestDb();
  const ids = sequentialIds('s');
  const text = '2 onions\n1 cup milk\nSalt, to taste';
  const recipeId = await saveRecipe(db, { title: 'Soup', rawText: text, baseServings: 4, ingredients: draftLinesFromText(text, ids) }, 1, ids);
  const listId = await createList(db, [{ recipeId, targetServings: 4 }], Date.UTC(2026, 9, 1, 12), ids);
  return { db, listId };
}

const routes = [
  { path: '/lists', element: <ListsScreen /> },
  { path: '/lists/:id', element: <ListScreen makeId={sequentialIds('new')} now={() => 50} undoMs={60_000} /> },
];

describe('ListsScreen', () => {
  it('shows saved lists with progress and deletes after confirm', async () => {
    const { db } = await seededList();
    const { user } = renderRoutes(routes, '/lists', db);
    expect(await screen.findByText('Shopping list, Oct 1')).toBeInTheDocument();
    expect(screen.getByText('0 of 3 in cart')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Shopping progress' })).toHaveAttribute('aria-valuenow', '0');
    await user.click(screen.getByRole('button', { name: 'Delete Shopping list, Oct 1' }));
    await user.click(await screen.findByRole('button', { name: 'Delete list' }));
    expect(await screen.findByText(/No lists yet/)).toBeInTheDocument();
  });
});

describe('ListScreen', () => {
  it('shows an icon badge on every aisle section and the pantry section', async () => {
    const { db, listId } = await seededList();
    renderRoutes(routes, `/lists/${listId}`, db);
    for (const name of ['Produce', 'Dairy & Eggs', 'Check pantry']) {
      const region = await screen.findByRole('region', { name });
      expect(region.querySelector('[data-aisle-badge] svg')).not.toBeNull();
    }
  });

  it('filters to one aisle and back', async () => {
    const { db, listId } = await seededList();
    const { user } = renderRoutes(routes, `/lists/${listId}`, db);
    await user.click(await screen.findByRole('button', { name: 'Show only Produce' }));
    expect(screen.getByRole('button', { name: 'Show only Produce' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('region', { name: 'Produce' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Dairy & Eggs' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Check pantry' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show all aisles' }));
    expect(screen.getByRole('region', { name: 'Dairy & Eggs' })).toBeInTheDocument();
  });

  it('goes back to all aisles when the filtered aisle runs out', async () => {
    const { db, listId } = await seededList();
    const { user } = renderRoutes(routes, `/lists/${listId}`, db);
    await user.click(await screen.findByRole('button', { name: 'Show only Produce' }));
    await user.click(screen.getByRole('button', { name: 'Onions: 2' }));
    expect(await screen.findByRole('region', { name: 'Dairy & Eggs' })).toBeInTheDocument();
  });

  it('shows shopping progress that follows checked items', async () => {
    const { db, listId } = await seededList();
    const { user } = renderRoutes(routes, `/lists/${listId}`, db);
    const bar = await screen.findByRole('progressbar', { name: 'Shopping progress' });
    expect(bar).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByText('0 of 3 in cart')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Onions: 2' }));
    await waitFor(() => expect(bar).toHaveAttribute('aria-valuenow', '1'));
    expect(screen.getByText('1 of 3 in cart')).toBeInTheDocument();
  });

  it('renames the list in an in-app dialog, not a browser prompt', async () => {
    const prompt = vi.spyOn(window, 'prompt');
    const { db, listId } = await seededList();
    const { user } = renderRoutes(routes, `/lists/${listId}`, db);
    await user.click(await screen.findByRole('button', { name: 'Rename list' }));
    const dialog = screen.getByRole('dialog', { name: 'Rename list' });
    const input = within(dialog).getByLabelText('List name');
    await user.clear(input);
    await user.type(input, 'Weekend shop');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('heading', { name: 'Weekend shop' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(prompt).not.toHaveBeenCalled();
  });

  it('cancelling the rename dialog changes nothing', async () => {
    const { db, listId } = await seededList();
    const { user } = renderRoutes(routes, `/lists/${listId}`, db);
    await user.click(await screen.findByRole('button', { name: 'Rename list' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Shopping list, Oct 1' })).toBeInTheDocument();
  });

  it('shows a not-found message for a missing list', async () => {
    renderRoutes(routes, '/lists/missing', createTestDb());
    expect(await screen.findByText('List not found.')).toBeInTheDocument();
  });

  it('groups items by aisle with a pantry section', async () => {
    const { db, listId } = await seededList();
    renderRoutes(routes, `/lists/${listId}`, db);
    const produce = await screen.findByRole('region', { name: 'Produce' });
    expect(within(produce).getByRole('button', { name: 'Onions: 2' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Dairy & Eggs' })).getByRole('button', { name: 'Milk: 1 cup' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Check pantry' })).getByRole('button', { name: 'Salt' })).toBeInTheDocument();
  });

  it('moves a checked item into In cart and can undo', async () => {
    const { db, listId } = await seededList();
    const { user } = renderRoutes(routes, `/lists/${listId}`, db);
    await user.click(await screen.findByRole('button', { name: 'Onions: 2' }));
    expect(await screen.findByText('In cart (1)')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Produce' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await screen.findByRole('region', { name: 'Produce' })).toBeInTheDocument();
    expect(screen.queryByText('In cart (1)')).not.toBeInTheDocument();
  });

  it('adds an ad-hoc item into its aisle', async () => {
    const { db, listId } = await seededList();
    const { user } = renderRoutes(routes, `/lists/${listId}`, db);
    await user.type(await screen.findByLabelText('Add an item'), 'paper towels');
    await user.click(screen.getByRole('button', { name: 'Add item' }));
    const household = await screen.findByRole('region', { name: 'Household' });
    expect(within(household).getByRole('button', { name: 'Paper towels' })).toBeInTheDocument();
  });

  it('moves an item to another aisle and remembers it', async () => {
    const { db, listId } = await seededList();
    const { user } = renderRoutes(routes, `/lists/${listId}`, db);
    await user.click(await screen.findByRole('button', { name: 'Options for milk' }));
    await user.selectOptions(screen.getByLabelText('Aisle for milk'), 'frozen');
    expect(await screen.findByRole('region', { name: 'Frozen' })).toBeInTheDocument();
    expect(await db.aisleOverrides.get('milk')).toMatchObject({ aisleId: 'frozen', source: 'user' });
  });

  it('edits and deletes an item', async () => {
    const { db, listId } = await seededList();
    const { user } = renderRoutes(routes, `/lists/${listId}`, db);
    await user.click(await screen.findByRole('button', { name: 'Options for milk' }));
    const input = screen.getByLabelText('Edit milk');
    await user.clear(input);
    await user.type(input, '2 cups oat milk');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('button', { name: 'Oat milk: 2 cups' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Options for oat milk' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Oat milk: 2 cups' })).not.toBeInTheDocument());
  });

  it('copies the list as text', async () => {
    const { db, listId } = await seededList();
    const { user } = renderRoutes(routes, `/lists/${listId}`, db);
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    await user.click(await screen.findByRole('button', { name: 'Copy list as text' }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Produce\n- Onions: 2'));
    expect(await screen.findByText('Copied to clipboard')).toBeInTheDocument();
  });
});

// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createList } from '../../app/lists';
import { draftLinesFromText, saveRecipe } from '../../app/recipes';
import { getSettings, type CartCraftDb } from '../../data/db';
import { createTestDb, sequentialIds } from '../../test/db';
import { renderRoutes } from '../../test/render';
import { ListScreen } from './ListScreen';

async function seededList(): Promise<{ db: CartCraftDb; listId: string }> {
  const db = createTestDb();
  const ids = sequentialIds('s');
  const text = '2 onions';
  const recipeId = await saveRecipe(db, { title: 'Soup', rawText: text, baseServings: 4, ingredients: draftLinesFromText(text, ids) }, 1, ids);
  const listId = await createList(db, [{ recipeId, targetServings: 4 }], Date.UTC(2026, 9, 1, 12), ids);
  return { db, listId };
}

const routes = [{ path: '/lists/:id', element: <ListScreen /> }];

afterEach(() => {
  Reflect.deleteProperty(navigator, 'wakeLock');
});

describe('ListScreen keep screen on', () => {
  it('is not in the list menu when the browser has no Screen Wake Lock', async () => {
    const { db, listId } = await seededList();
    const { user } = renderRoutes(routes, `/lists/${listId}`, db);
    await user.click(await screen.findByRole('button', { name: 'List options' }));
    expect(screen.getByRole('menuitem', { name: 'Rename list' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitemcheckbox', { name: 'Keep screen on' })).toBeNull();
  });

  it('saves the setting from the list menu and holds the wake lock while on', async () => {
    const request = vi.fn(async () => ({ released: false, release: vi.fn(async () => undefined) }));
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
    const { db, listId } = await seededList();
    const { user } = renderRoutes(routes, `/lists/${listId}`, db);
    await user.click(await screen.findByRole('button', { name: 'List options' }));
    const toggle = screen.getByRole('menuitemcheckbox', { name: 'Keep screen on' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(request).not.toHaveBeenCalled();
    await user.click(toggle);
    await waitFor(async () => expect((await getSettings(db)).keepScreenOn).toBe(true));
    await waitFor(() => expect(request).toHaveBeenCalledWith('screen'));
    expect(screen.getByRole('menuitemcheckbox', { name: 'Keep screen on' })).toHaveAttribute('aria-checked', 'true');
  });
});

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
  it('is hidden when the browser has no Screen Wake Lock', async () => {
    const { db, listId } = await seededList();
    renderRoutes(routes, `/lists/${listId}`, db);
    expect(await screen.findByRole('button', { name: 'Onions: 2' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Keep screen on')).toBeNull();
  });

  it('saves the setting and holds the wake lock while on', async () => {
    const request = vi.fn(async () => ({ released: false, release: vi.fn(async () => undefined) }));
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
    const { db, listId } = await seededList();
    const { user } = renderRoutes(routes, `/lists/${listId}`, db);
    const toggle = await screen.findByLabelText('Keep screen on');
    expect(toggle).not.toBeChecked();
    expect(request).not.toHaveBeenCalled();
    await user.click(toggle);
    await waitFor(async () => expect((await getSettings(db)).keepScreenOn).toBe(true));
    await waitFor(() => expect(request).toHaveBeenCalledWith('screen'));
  });
});

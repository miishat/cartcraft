// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { formatAmounts } from '../../domain';
import { draftLinesFromText, saveRecipe } from '../../app/recipes';
import type { CartCraftDb } from '../../data/db';
import { createTestDb, sequentialIds } from '../../test/db';
import { renderRoutes } from '../../test/render';
import { RecipesScreen } from './RecipesScreen';

async function addRecipe(db: CartCraftDb, title: string, text: string, baseServings = 4) {
  const ids = sequentialIds(title);
  return saveRecipe(db, { title, rawText: text, baseServings, ingredients: draftLinesFromText(text, ids) }, 1, ids);
}

const routes = [{ path: '/', element: <RecipesScreen makeId={sequentialIds('new')} now={() => 5} /> }];

describe('RecipesScreen', () => {
  it('shows an empty state', async () => {
    renderRoutes(routes, '/');
    expect(await screen.findByText(/No recipes yet/)).toBeInTheDocument();
  });

  it('filters by search', async () => {
    const db = createTestDb();
    await addRecipe(db, 'Tacos', '1 onion');
    await addRecipe(db, 'Soup', '2 carrots');
    const { user } = renderRoutes(routes, '/', db);
    await screen.findByText('Tacos');
    await user.type(screen.getByLabelText('Search recipes'), 'so');
    expect(screen.queryByText('Tacos')).not.toBeInTheDocument();
    expect(screen.getByText('Soup')).toBeInTheDocument();
  });

  it('builds a list from selected recipes with per-recipe servings', async () => {
    const db = createTestDb();
    await addRecipe(db, 'Tacos', '1 cup milk');
    await addRecipe(db, 'Soup', '2 carrots', 2);
    const { user } = renderRoutes(routes, '/', db);

    await user.click(await screen.findByRole('button', { name: 'Select Tacos' }));
    await user.click(screen.getByRole('button', { name: 'More servings for Tacos' }));
    await user.click(screen.getByRole('button', { name: 'More servings for Tacos' }));
    await user.click(screen.getByRole('button', { name: 'Select Soup' }));
    await user.click(screen.getByRole('button', { name: 'Build list (2)' }));

    await waitFor(() => expect(screen.getByTestId('location').textContent).toMatch(/^\/lists\//));
    const [list] = await db.lists.toArray();
    expect(list?.sources.map((s) => [s.title, s.targetServings])).toEqual([['Tacos', 6], ['Soup', 4]]);
    const byKey = Object.fromEntries(list!.items.map((i) => [i.itemKey, formatAmounts(i.amounts, 'us')]));
    expect(byKey).toEqual({ milk: '1 1/2 cups', carrot: '4' });
  });
});

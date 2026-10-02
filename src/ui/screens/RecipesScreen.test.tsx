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
  it('shows an emoji cover on each recipe', async () => {
    const db = createTestDb();
    await addRecipe(db, 'Tacos', '1 onion');
    renderRoutes(routes, '/', db);
    const link = await screen.findByRole('link', { name: 'View Tacos' });
    expect(link.querySelector('[data-recipe-cover]')).toHaveTextContent('🌮');
  });

  it('summarises the selection on the Build list bar', async () => {
    const db = createTestDb();
    await addRecipe(db, 'Tacos', '1 cup milk\n2 onions');
    await addRecipe(db, 'Soup', '2 carrots');
    const { user } = renderRoutes(routes, '/', db);
    await user.click(await screen.findByRole('button', { name: 'Select Tacos' }));
    expect(screen.getByRole('button', { name: 'Build list (1)' })).toHaveTextContent('1 recipe · 2 ingredients');
    await user.click(screen.getByRole('button', { name: 'Select Soup' }));
    expect(screen.getByRole('button', { name: 'Build list (2)' })).toHaveTextContent('2 recipes · 3 ingredients');
  });

  it('counts only ingredient lines on each row', async () => {
    const db = createTestDb();
    await addRecipe(db, 'Pasta', 'For the sauce:\n1 cup milk\n2 onions', 4);
    await addRecipe(db, 'Soup', '2 carrots', 2);
    renderRoutes(routes, '/', db);
    const pasta = await screen.findByRole('link', { name: 'View Pasta' });
    expect(pasta).toHaveTextContent('2 ingredients · serves 4');
    expect(screen.getByRole('link', { name: 'View Soup' })).toHaveTextContent('1 ingredient · serves 2');
  });

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

  it('shows an alert and stays put when building the list fails', async () => {
    const db = createTestDb();
    const id = await addRecipe(db, 'Tacos', '1 cup milk');
    const { user } = renderRoutes(routes, '/', db);
    await user.click(await screen.findByRole('button', { name: 'Select Tacos' }));
    await db.recipes.delete(id);
    await user.click(screen.getByRole('button', { name: 'Build list (1)' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not build the list. Try again.');
    expect(screen.getByTestId('location').textContent).toBe('/');
    expect(screen.getByRole('button', { name: 'Build list (1)' })).toBeEnabled();
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

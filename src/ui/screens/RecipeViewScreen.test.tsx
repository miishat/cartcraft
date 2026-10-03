// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { draftLinesFromText, saveRecipe } from '../../app/recipes';
import type { UrlImportResult } from '../../services/urlImport';
import { createTestDb, sequentialIds } from '../../test/db';
import { renderRoutes } from '../../test/render';
import { RecipeViewScreen } from './RecipeViewScreen';
import { RecipesScreen } from './RecipesScreen';

const routes = [
  { path: '/', element: <RecipesScreen /> },
  { path: '/recipes/:id/view', element: <RecipeViewScreen /> },
];

async function seeded(sourceUrl?: string, steps?: { text: string; isHeader: boolean }[]) {
  const db = createTestDb();
  const ids = sequentialIds('r');
  const text = '2 cups flour\n1 onion, diced\nSalt, to taste';
  const id = await saveRecipe(
    db,
    { title: 'Bread', rawText: text, baseServings: 2, ingredients: draftLinesFromText(text, ids), ...(sourceUrl ? { sourceUrl } : {}), ...(steps ? { steps } : {}) },
    1,
    ids,
  );
  return { db, id };
}

describe('RecipeViewScreen', () => {
  it('opens from the recipe list and shows the ingredients', async () => {
    const { db, id } = await seeded();
    const { user } = renderRoutes(routes, '/', db);
    await user.click(await screen.findByRole('link', { name: 'View Bread' }));
    expect(screen.getByTestId('location').textContent).toBe(`/recipes/${id}/view`);
    expect(await screen.findByRole('heading', { name: 'Bread' })).toBeInTheDocument();
    expect(screen.getByText('2 cups flour')).toBeInTheDocument();
    expect(screen.getByText('1 onion, diced')).toBeInTheDocument();
    expect(screen.getByText('Salt, to taste')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Edit/ })).toHaveAttribute('href', `/recipes/${id}`);
  });

  it('scales the amounts with the servings stepper without saving anything', async () => {
    const { db, id } = await seeded();
    const { user } = renderRoutes(routes, `/recipes/${id}/view`, db);
    await screen.findByText('2 cups flour');
    await user.click(screen.getByRole('button', { name: 'More servings for Bread' }));
    await user.click(screen.getByRole('button', { name: 'More servings for Bread' }));
    expect(screen.getByText('4 cups flour')).toBeInTheDocument();
    expect(screen.getByText('Written for 2')).toBeInTheDocument();
    expect((await db.recipes.get(id))?.baseServings).toBe(2);
  });

  it('links the source page only when it is a web address', async () => {
    const { db, id } = await seeded('https://example.com/bread');
    renderRoutes(routes, `/recipes/${id}/view`, db);
    expect(await screen.findByRole('link', { name: /View original/ })).toHaveAttribute('href', 'https://example.com/bread');
  });

  it('shows a not-found message for a missing recipe', async () => {
    renderRoutes(routes, '/recipes/missing/view', createTestDb());
    expect(await screen.findByText('Recipe not found.')).toBeInTheDocument();
  });
  it('shows the recipe cover beside the servings', async () => {
    const { db, id } = await seeded();
    renderRoutes(routes, `/recipes/${id}/view`, db);
    await screen.findByRole('heading', { name: 'Bread' });
    expect(document.querySelector('[data-recipe-cover]')).toHaveTextContent('🍞');
  });

  it('shows saved steps under a Method region without fetching', async () => {
    const { db, id } = await seeded('https://example.com/bread', [
      { text: 'Rice', isHeader: true },
      { text: 'Boil water', isHeader: false },
    ]);
    const fake = vi.fn();
    renderRoutes([{ path: '/recipes/:id/view', element: <RecipeViewScreen importRecipe={fake} /> }], `/recipes/${id}/view`, db);
    const method = await screen.findByRole('region', { name: 'Method' });
    expect(within(method).getByRole('heading', { name: 'Rice' })).toBeInTheDocument();
    expect(within(method).getByText('Boil water')).toBeInTheDocument();
    expect(fake).not.toHaveBeenCalled();
  });

  it('fetches steps once for a recipe without any and then shows them', async () => {
    const { db, id } = await seeded('https://example.com/bread');
    const fake = vi.fn(async (): Promise<UrlImportResult> => ({
      ok: true,
      recipe: { title: 'Bread', ingredients: ['2 cups flour'], steps: [{ text: 'Knead it', isHeader: false }], sourceUrl: 'https://example.com/bread' } as never,
    }));
    renderRoutes([{ path: '/recipes/:id/view', element: <RecipeViewScreen importRecipe={fake} /> }], `/recipes/${id}/view`, db);
    expect(await screen.findByText('Knead it')).toBeInTheDocument();
    expect(fake).toHaveBeenCalledTimes(1);
    expect(fake).toHaveBeenCalledWith('https://example.com/bread');
  });

  it('clears the fetching status once a failed fetch settles', async () => {
    const { db, id } = await seeded('https://example.com/bread');
    const fake = vi.fn(async (): Promise<UrlImportResult> => ({ ok: false, error: 'fetch_failed' }));
    renderRoutes([{ path: '/recipes/:id/view', element: <RecipeViewScreen importRecipe={fake} /> }], `/recipes/${id}/view`, db);
    await screen.findByText('2 cups flour');
    await waitFor(() => expect(fake).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText(/Getting the method/)).toBeNull());
  });

  it('shows no Method region for a recipe without a source', async () => {
    const { db, id } = await seeded();
    renderRoutes(routes, `/recipes/${id}/view`, db);
    await screen.findByText('2 cups flour');
    expect(screen.queryByRole('region', { name: 'Method' })).toBeNull();
  });

  it('shows no status, no fetch and no link for a source that is not a web address', async () => {
    const { db, id } = await seeded("Grandma's cookbook p.5");
    const fake = vi.fn();
    renderRoutes([{ path: '/recipes/:id/view', element: <RecipeViewScreen importRecipe={fake} /> }], `/recipes/${id}/view`, db);
    await screen.findByText('2 cups flour');
    expect(screen.queryByText(/Getting the method/)).toBeNull();
    expect(screen.queryByRole('link', { name: /View original/ })).toBeNull();
    expect(fake).not.toHaveBeenCalled();
  });
});

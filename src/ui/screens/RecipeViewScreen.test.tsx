// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { draftLinesFromText, saveRecipe } from '../../app/recipes';
import { createTestDb, sequentialIds } from '../../test/db';
import { renderRoutes } from '../../test/render';
import { RecipeViewScreen } from './RecipeViewScreen';
import { RecipesScreen } from './RecipesScreen';

const routes = [
  { path: '/', element: <RecipesScreen /> },
  { path: '/recipes/:id/view', element: <RecipeViewScreen /> },
];

async function seeded(sourceUrl?: string) {
  const db = createTestDb();
  const ids = sequentialIds('r');
  const text = '2 cups flour\n1 onion, diced\nSalt, to taste';
  const id = await saveRecipe(
    db,
    { title: 'Bread', rawText: text, baseServings: 2, ingredients: draftLinesFromText(text, ids), ...(sourceUrl ? { sourceUrl } : {}) },
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
    expect(await screen.findByRole('link', { name: 'https://example.com/bread' })).toHaveAttribute('href', 'https://example.com/bread');
  });

  it('shows a not-found message for a missing recipe', async () => {
    renderRoutes(routes, '/recipes/missing/view', createTestDb());
    expect(await screen.findByText('Recipe not found.')).toBeInTheDocument();
  });
});

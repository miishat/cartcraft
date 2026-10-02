// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { draftLinesFromText, saveRecipe } from '../../app/recipes';
import { createTestDb, sequentialIds } from '../../test/db';
import { renderRoutes } from '../../test/render';
import { RecipeEditorScreen } from './RecipeEditorScreen';

const routes = (makeId = sequentialIds('id')) => [
  { path: '/recipes/new', element: <RecipeEditorScreen makeId={makeId} now={() => 1000} /> },
  { path: '/recipes/:id', element: <RecipeEditorScreen makeId={makeId} now={() => 2000} /> },
];

describe('RecipeEditorScreen', () => {
  it('parses pasted text, prefills servings, and saves after review', async () => {
    const { user, db } = renderRoutes(routes(), '/recipes/new');
    await user.type(screen.getByLabelText('Ingredients'), '2 cups flour{enter}3 eggs');
    await user.click(screen.getByRole('button', { name: 'Parse ingredients' }));

    expect(screen.getByText('Review (2 lines)')).toBeInTheDocument();
    expect(screen.getByLabelText('Base servings')).toHaveValue(4);
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();

    await user.type(screen.getByLabelText('Title'), 'Pancakes');
    await user.click(save);

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/'));
    const [recipe] = await db.recipes.toArray();
    expect(recipe).toMatchObject({ title: 'Pancakes', baseServings: 4, rawText: '2 cups flour\n3 eggs', createdAt: 1000 });
    expect(recipe?.ingredients.map((l) => l.itemKey)).toEqual(['flour', 'egg']);
  });

  it('does not save without base servings', async () => {
    const { user } = renderRoutes(routes(), '/recipes/new');
    await user.type(screen.getByLabelText('Ingredients'), '1 egg');
    await user.click(screen.getByRole('button', { name: 'Parse ingredients' }));
    await user.type(screen.getByLabelText('Title'), 'Egg');
    await user.clear(screen.getByLabelText('Base servings'));
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('shows a not-found message for a missing recipe instead of the form', async () => {
    renderRoutes(routes(), '/recipes/missing', createTestDb());
    expect(await screen.findByText('Recipe not found.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /recipes/i })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    expect(screen.queryByText('Edit recipe')).not.toBeInTheDocument();
  });

  it('loads an existing recipe for editing and deletes it', async () => {
    const db = createTestDb();
    const ids = sequentialIds('r');
    const id = await saveRecipe(db, { title: 'Soup', rawText: '1 onion', baseServings: 2, ingredients: draftLinesFromText('1 onion', ids) }, 1, ids);
    const { user } = renderRoutes(routes(), `/recipes/${id}`, db);

    expect(await screen.findByDisplayValue('Soup')).toBeInTheDocument();
    expect(screen.getByLabelText('Base servings')).toHaveValue(2);

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Delete recipe' }));
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/'));
    expect(await db.recipes.count()).toBe(0);
  });

  it('shows an inline error when delete fails and stays on the page', async () => {
    const db = createTestDb();
    const ids = sequentialIds('r');
    const id = await saveRecipe(db, { title: 'Soup', rawText: '1 onion', baseServings: 2, ingredients: draftLinesFromText('1 onion', ids) }, 1, ids);
    const { user } = renderRoutes(routes(), `/recipes/${id}`, db);
    await screen.findByDisplayValue('Soup');
    vi.spyOn(db.recipes, 'delete').mockRejectedValueOnce(new Error('disk full'));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Delete recipe' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not delete the recipe. Try again.');
    expect(screen.getByTestId('location').textContent).toBe(`/recipes/${id}`);
  });

  it('keeps a pending line edit when Save is clicked directly', async () => {
    const { user, db } = renderRoutes(routes(), '/recipes/new');
    await user.type(screen.getByLabelText('Ingredients'), '1 egg');
    await user.click(screen.getByRole('button', { name: 'Parse ingredients' }));
    await user.type(screen.getByLabelText('Title'), 'Egg');
    const line = screen.getByLabelText('Ingredient line 1');
    await user.clear(line);
    await user.type(line, '2 cups milk');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/'));
    const [recipe] = await db.recipes.toArray();
    expect(recipe?.ingredients.map((l) => l.itemKey)).toEqual(['milk']);
  });
});

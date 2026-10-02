// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { UrlImportResult } from '../../services/urlImport';
import { sequentialIds } from '../../test/db';
import { renderRoutes } from '../../test/render';
import { RecipeEditorScreen } from './RecipeEditorScreen';

const URL = 'https://www.example.com/recipes/tacos';

function setup(result: UrlImportResult) {
  const importRecipe = vi.fn(async () => result);
  const view = renderRoutes(
    [{ path: '/recipes/new', element: <RecipeEditorScreen makeId={sequentialIds('id')} now={() => 1000} importRecipe={importRecipe} /> }],
    '/recipes/new',
  );
  return { ...view, importRecipe };
}

describe('RecipeEditorScreen: import from link', () => {
  it('offers Import from link for a pasted URL and fills the review', async () => {
    const { user, db, importRecipe } = setup({
      ok: true,
      recipe: { title: 'Tacos', ingredients: ['1 lb ground beef', '8 tortillas'], servings: 6, sourceUrl: URL },
    });
    await user.type(screen.getByLabelText('Ingredients'), URL);
    expect(screen.queryByRole('button', { name: 'Parse ingredients' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Import from link' }));

    expect(importRecipe).toHaveBeenCalledWith(URL);
    expect(await screen.findByText('Review (2 lines)')).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Tacos');
    expect(screen.getByLabelText('Base servings')).toHaveValue(6);
    expect(screen.getByRole('link', { name: URL })).toHaveAttribute('href', URL);

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/'));
    const [recipe] = await db.recipes.toArray();
    expect(recipe).toMatchObject({ title: 'Tacos', baseServings: 6, sourceUrl: URL, rawText: '1 lb ground beef\n8 tortillas' });
  });

  it('asks the user to check servings when the page has none', async () => {
    const { user } = setup({
      ok: true,
      recipe: { title: 'Pancakes', ingredients: ['100g plain flour'], yieldText: 'Makes 12', sourceUrl: URL },
    });
    await user.type(screen.getByLabelText('Ingredients'), URL);
    await user.click(screen.getByRole('button', { name: 'Import from link' }));
    expect(await screen.findByText(/did not say how many servings/)).toHaveTextContent('it says "Makes 12"');
    expect(screen.getByLabelText('Base servings')).toHaveValue(4);
  });

  it('switches to paste mode when the site blocks the import, keeping the source', async () => {
    const { user } = setup({ ok: false, error: 'blocked' });
    await user.type(screen.getByLabelText('Ingredients'), URL);
    await user.click(screen.getByRole('button', { name: 'Import from link' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('This site blocks automatic imports');
    expect(screen.getByLabelText('Ingredients')).toHaveValue('');
    expect(screen.getByRole('link', { name: URL })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Parse ingredients' })).toBeInTheDocument();
  });

  it('keeps the link when the error is not about the page', async () => {
    const { user } = setup({ ok: false, error: 'rate_limited' });
    await user.type(screen.getByLabelText('Ingredients'), URL);
    await user.click(screen.getByRole('button', { name: 'Import from link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many imports');
    expect(screen.getByLabelText('Ingredients')).toHaveValue(URL);
  });

  it('shows a fallback message when the import throws', async () => {
    const importRecipe = vi.fn(async (): Promise<UrlImportResult> => {
      throw new Error('boom');
    });
    const { user } = renderRoutes(
      [{ path: '/recipes/new', element: <RecipeEditorScreen makeId={sequentialIds('id')} importRecipe={importRecipe} /> }],
      '/recipes/new',
    );
    await user.type(screen.getByLabelText('Ingredients'), URL);
    await user.click(screen.getByRole('button', { name: 'Import from link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not import that link.');
  });
});

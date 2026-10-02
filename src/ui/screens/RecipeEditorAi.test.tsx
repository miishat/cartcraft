// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { parseIngredientLine } from '../../domain';
import { saveAiKey, type AiDraft } from '../../app/ai';
import { LlmError } from '../../services/llm/client';
import type { PageTextResult, UrlImportResult } from '../../services/urlImport';
import { createTestDb, sequentialIds } from '../../test/db';
import { renderRoutes } from '../../test/render';
import { RecipeEditorScreen } from './RecipeEditorScreen';

const URL = 'https://www.example.com/blog/pancakes';

const draft: AiDraft = {
  title: 'Pancakes',
  servings: 4,
  lines: [parseIngredientLine('2 cups flour', 'a'), { ...parseIngredientLine('3 eggs', 'b'), needsReview: true }],
};

async function setup(options: {
  withKey?: boolean;
  cleanUp?: (text: string) => Promise<AiDraft>;
  importRecipe?: (url: string) => Promise<UrlImportResult>;
  fetchText?: (url: string) => Promise<PageTextResult>;
} = {}) {
  const db = createTestDb();
  if (options.withKey ?? true) await saveAiKey(db, 'sk-test');
  const cleanUp = vi.fn(options.cleanUp ?? (async () => draft));
  const view = renderRoutes(
    [{
      path: '/recipes/new',
      element: (
        <RecipeEditorScreen
          makeId={sequentialIds('id')}
          cleanUp={cleanUp}
          importRecipe={options.importRecipe ?? (async () => ({ ok: false, error: 'no_recipe_data' }))}
          fetchText={options.fetchText ?? (async () => ({ ok: true, text: 'page text with 2 cups flour', sourceUrl: URL }))}
        />
      ),
    }],
    '/recipes/new',
    db,
  );
  return { ...view, cleanUp };
}

describe('RecipeEditorScreen: AI', () => {
  it('explains how to enable AI when no key is saved', async () => {
    const { user } = await setup({ withKey: false });
    await user.type(screen.getByLabelText('Ingredients'), 'some messy text');
    expect(await screen.findByRole('button', { name: 'Clean up with AI' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Add an AI key in Settings' })).toHaveAttribute('href', '/settings');
  });

  it('cleans up pasted text into reviewed lines', async () => {
    const { user, cleanUp } = await setup();
    await user.type(screen.getByLabelText('Ingredients'), 'Grandma used 2 cups flour and eggs');
    const button = await screen.findByRole('button', { name: 'Clean up with AI' });
    await vi.waitFor(() => expect(button).toBeEnabled());
    await user.click(button);

    expect(cleanUp).toHaveBeenCalledWith('Grandma used 2 cups flour and eggs');
    expect(await screen.findByText('Review (2 lines)')).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Pancakes');
    expect(screen.getByLabelText('Base servings')).toHaveValue(4);
    expect(screen.getAllByLabelText('Check this line')).toHaveLength(1);
  });

  it('keeps servings the user already entered', async () => {
    const { user } = await setup();
    await user.type(screen.getByLabelText('Ingredients'), 'Grandma used 2 cups flour and eggs');
    await user.click(screen.getByRole('button', { name: 'Parse ingredients' }));
    const field = await screen.findByLabelText('Base servings');
    await user.clear(field);
    await user.type(field, '6');
    const button = await screen.findByRole('button', { name: 'Clean up with AI' });
    await vi.waitFor(() => expect(button).toBeEnabled());
    await user.click(button);
    expect(await screen.findByText('Review (2 lines)')).toBeInTheDocument();
    expect(screen.getByLabelText('Base servings')).toHaveValue(6);
    expect(screen.queryByText(/Check base servings/)).not.toBeInTheDocument();
  });

  it('warns to check servings when the AI supplied them', async () => {
    const { user } = await setup();
    await user.type(screen.getByLabelText('Ingredients'), 'Grandma used 2 cups flour and eggs');
    const button = await screen.findByRole('button', { name: 'Clean up with AI' });
    await vi.waitFor(() => expect(button).toBeEnabled());
    await user.click(button);
    expect(await screen.findByText(/Check base servings/)).toBeInTheDocument();
  });

  it('shows the AI error and keeps the text', async () => {
    const { user } = await setup({ cleanUp: async () => { throw new LlmError('bad_response'); } });
    await user.type(screen.getByLabelText('Ingredients'), 'messy');
    const button = await screen.findByRole('button', { name: 'Clean up with AI' });
    await vi.waitFor(() => expect(button).toBeEnabled());
    await user.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent("The AI didn't return usable data.");
    expect(screen.getByLabelText('Ingredients')).toHaveValue('messy');
  });

  it('offers Try with AI when a page has no recipe data', async () => {
    const fetchText = vi.fn(async (): Promise<PageTextResult> => ({ ok: true, text: 'page text with 2 cups flour', sourceUrl: URL }));
    const { user, cleanUp } = await setup({ fetchText });
    await user.type(screen.getByLabelText('Ingredients'), URL);
    await user.click(screen.getByRole('button', { name: 'Import from link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No recipe data found');

    await user.click(await screen.findByRole('button', { name: 'Try with AI' }));
    expect(fetchText).toHaveBeenCalledWith(URL);
    expect(cleanUp).toHaveBeenCalledWith('page text with 2 cups flour');
    expect(await screen.findByText('Review (2 lines)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: URL })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try with AI' })).not.toBeInTheDocument();
  });

  it('does not offer Try with AI without a key', async () => {
    const { user } = await setup({ withKey: false });
    await user.type(screen.getByLabelText('Ingredients'), URL);
    await user.click(screen.getByRole('button', { name: 'Import from link' }));
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/No recipe data found/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try with AI' })).not.toBeInTheDocument();
  });

  it('shows only the latest error when a different action fails next', async () => {
    const { user } = await setup({
      importRecipe: async () => { throw new Error('boom'); },
      cleanUp: async () => { throw new LlmError('bad_response'); },
    });
    const box = screen.getByLabelText('Ingredients');
    await user.type(box, URL);
    await user.click(screen.getByRole('button', { name: 'Import from link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not import that link');

    await user.clear(box);
    await user.type(box, 'messy');
    const button = await screen.findByRole('button', { name: 'Clean up with AI' });
    await vi.waitFor(() => expect(button).toBeEnabled());
    await user.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent("The AI didn't return usable data.");
    expect(screen.queryByText(/Could not import that link/)).not.toBeInTheDocument();
  });

  it('drops Try with AI once the field is edited', async () => {
    const { user } = await setup();
    const box = screen.getByLabelText('Ingredients');
    await user.type(box, URL);
    await user.click(screen.getByRole('button', { name: 'Import from link' }));
    expect(await screen.findByRole('button', { name: 'Try with AI' })).toBeInTheDocument();
    await user.type(box, '2');
    expect(screen.queryByRole('button', { name: 'Try with AI' })).not.toBeInTheDocument();
  });
});

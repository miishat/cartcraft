// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { createList } from '../app/lists';
import { draftLinesFromText, saveRecipe } from '../app/recipes';
import { createTestDb, sequentialIds } from '../test/db';
import { AppRoutes } from './App';
import { DbProvider } from './db';

function renderApp(url: string, db = createTestDb()) {
  const user = userEvent.setup();
  render(
    <DbProvider db={db}>
      <MemoryRouter initialEntries={[url]}>
        <AppRoutes />
      </MemoryRouter>
    </DbProvider>,
  );
  return { user };
}

describe('AppRoutes', () => {
  it('starts on Recipes and navigates with the tab bar', async () => {
    const { user } = renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Recipes' })).toBeInTheDocument();
    const tabs = screen.getByRole('navigation', { name: 'Tabs' });
    await user.click(within(tabs).getByRole('link', { name: 'Lists' }));
    expect(await screen.findByRole('heading', { name: 'Lists' })).toBeInTheDocument();
    await user.click(within(tabs).getByRole('link', { name: 'Settings' }));
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument();
  });

  it('opens the add recipe screen', async () => {
    const { user } = renderApp('/');
    await user.click(await screen.findByRole('link', { name: 'Add recipe' }));
    expect(await screen.findByRole('heading', { name: 'Add recipe' })).toBeInTheDocument();
  });

  it('redirects unknown paths to Recipes', async () => {
    renderApp('/nope');
    expect(await screen.findByRole('heading', { name: 'Recipes' })).toBeInTheDocument();
  });

  it('hides the top bar on phones, where each screen has its own header', async () => {
    renderApp('/');
    expect(await screen.findByRole('banner')).toHaveClass('hidden', 'md:block');
  });

  it('has a compact Add link on Recipes and no tagline', async () => {
    renderApp('/');
    const add = await screen.findByRole('link', { name: 'Add recipe' });
    expect(add).toHaveTextContent(/^Add$/);
    expect(screen.queryByText('Pick recipes for your next list')).not.toBeInTheDocument();
  });

  it('has a Back to Lists link on a list', async () => {
    const db = createTestDb();
    const ids = sequentialIds('s');
    const text = '2 onions';
    const recipeId = await saveRecipe(db, { title: 'Soup', rawText: text, baseServings: 4, ingredients: draftLinesFromText(text, ids) }, 1, ids);
    const listId = await createList(db, [{ recipeId, targetServings: 4 }], 1, ids);
    renderApp(`/lists/${listId}`, db);
    expect(await screen.findByRole('link', { name: 'Back to Lists' })).toHaveAttribute('href', '/lists');
  });
});

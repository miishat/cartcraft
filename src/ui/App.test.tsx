// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { createTestDb } from '../test/db';
import { AppRoutes } from './App';
import { DbProvider } from './db';

function renderApp(url: string) {
  const user = userEvent.setup();
  render(
    <DbProvider db={createTestDb()}>
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
});

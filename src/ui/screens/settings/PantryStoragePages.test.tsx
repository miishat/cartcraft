// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { updateSettings } from '../../../data/db';
import { createTestDb } from '../../../test/db';
import { renderRoutes } from '../../../test/render';
import { PantryPage } from './PantryPage';
import { StoragePage } from './StoragePage';

const routes = [
  { path: '/settings/pantry', element: <PantryPage /> },
  { path: '/settings/storage', element: <StoragePage /> },
];

afterEach(() => {
  Reflect.deleteProperty(navigator, 'storage');
});

describe('Pantry Staples page', () => {
  it('adds and removes pantry staples', async () => {
    const { user, db } = renderRoutes(routes, '/settings/pantry');
    expect(await screen.findByText('salt')).toBeInTheDocument();
    await user.type(screen.getByLabelText('New pantry staple'), 'Garlic Powder');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('garlic powder')).toBeInTheDocument();
    expect(screen.getByLabelText('New pantry staple')).toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'Remove garlic powder' }));
    await waitFor(async () => expect(await db.pantryStaples.get('garlic powder')).toBeUndefined());
  });
});

describe('Storage page', () => {
  it('shows usage, protection and the version', async () => {
    Object.defineProperty(navigator, 'storage', { value: { estimate: async () => ({ usage: 1024 * 1024 }) }, configurable: true });
    const db = createTestDb();
    await updateSettings(db, { persistGranted: true });
    renderRoutes(routes, '/settings/storage', db);
    expect(await screen.findByText('1.0 MB')).toBeInTheDocument();
    expect(await screen.findByText('This browser will keep your data.')).toBeInTheDocument();
    expect(screen.getByText('test')).toBeInTheDocument();
  });

  it('warns when the browser may clear data', async () => {
    const db = createTestDb();
    await updateSettings(db, { persistGranted: false });
    renderRoutes(routes, '/settings/storage', db);
    expect(await screen.findByText(/may clear your data when space runs low/)).toBeInTheDocument();
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });
});

// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { getSettings } from '../../../data/db';
import { renderRoutes } from '../../../test/render';
import { AppearancePage } from './AppearancePage';
import { ServingsPage } from './ServingsPage';
import { UnitsPage } from './UnitsPage';

const routes = [
  { path: '/settings/appearance', element: <AppearancePage /> },
  { path: '/settings/units', element: <UnitsPage /> },
  { path: '/settings/servings', element: <ServingsPage /> },
];

describe('Appearance page', () => {
  it('switches the theme and remembers it on this device', async () => {
    const { user } = renderRoutes(routes, '/settings/appearance');
    expect(screen.getByRole('heading', { level: 1, name: 'Appearance' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked();
    expect(screen.queryByRole('radio', { name: 'Match my device' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('cartcraft-theme')).toBe('dark');
    await user.click(screen.getByRole('radio', { name: 'System' }));
    expect(localStorage.getItem('cartcraft-theme')).toBeNull();
    delete document.documentElement.dataset.theme;
  });

  it('picks a colour palette and remembers it on this device', async () => {
    const { user } = renderRoutes(routes, '/settings/appearance');
    expect(screen.getByRole('radio', { name: 'Basil' })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'Plum' }));
    expect(document.documentElement.dataset.palette).toBe('plum');
    expect(localStorage.getItem('cartcraft-palette')).toBe('plum');
    expect(screen.getByRole('radio', { name: 'Plum' })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'Basil' }));
    expect(localStorage.getItem('cartcraft-palette')).toBeNull();
    delete document.documentElement.dataset.palette;
    delete document.documentElement.dataset.theme;
  });
});

describe('Units page', () => {
  it('saves the unit system', async () => {
    const { user, db } = renderRoutes(routes, '/settings/units');
    await user.click(await screen.findByRole('radio', { name: /^Metric/ }));
    await waitFor(async () => expect((await getSettings(db)).unitSystem).toBe('metric'));
    expect(screen.getByRole('radio', { name: /^Metric/ })).toBeChecked();
  });

  it('reports a failed save next to the choices', async () => {
    const { user, db } = renderRoutes(routes, '/settings/units');
    vi.spyOn(db.settings, 'put').mockRejectedValueOnce(new Error('disk'));
    await user.click(await screen.findByRole('radio', { name: /^Metric/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save that setting. Try again.');
  });
});

describe('Default servings page', () => {
  it('steps up and down and saves a typed number', async () => {
    const { user, db } = renderRoutes(routes, '/settings/servings');
    const input = await screen.findByLabelText('Default servings');
    await waitFor(() => expect(input).toHaveValue(4));
    await user.click(screen.getByRole('button', { name: 'More servings' }));
    await waitFor(async () => expect((await getSettings(db)).defaultServings).toBe(5));
    // The field follows the saved value, so the next step starts from 5, not a stale 4.
    await waitFor(() => expect(input).toHaveValue(5));
    await user.click(screen.getByRole('button', { name: 'Fewer servings' }));
    await waitFor(async () => expect((await getSettings(db)).defaultServings).toBe(4));
    await waitFor(() => expect(input).toHaveValue(4));
    await user.clear(input);
    await user.type(input, '6');
    await waitFor(async () => expect((await getSettings(db)).defaultServings).toBe(6));
  });

  it('never saves a typed number above 99', async () => {
    const { user, db } = renderRoutes(routes, '/settings/servings');
    const input = await screen.findByLabelText('Default servings');
    await waitFor(() => expect(input).toHaveValue(4));
    await user.clear(input);
    await user.type(input, '150');
    await waitFor(async () => expect((await getSettings(db)).defaultServings).toBe(15));
    expect((await getSettings(db)).defaultServings).toBeLessThanOrEqual(99);
    await user.tab();
    expect(input).toHaveValue(15);
  });

  it('keeps what is typed while the input is focused', async () => {
    const { user, db } = renderRoutes(routes, '/settings/servings');
    const input = await screen.findByLabelText('Default servings');
    await waitFor(() => expect(input).toHaveValue(4));
    await user.clear(input);
    await user.type(input, '12');
    await waitFor(async () => expect((await getSettings(db)).defaultServings).toBe(12));
    expect(input).toHaveValue(12);
  });

  it('ignores a cleared field and restores the saved number on blur', async () => {
    const { user, db } = renderRoutes(routes, '/settings/servings');
    const input = await screen.findByLabelText('Default servings');
    await waitFor(() => expect(input).toHaveValue(4));
    await user.clear(input);
    await user.tab();
    expect(input).toHaveValue(4);
    expect((await getSettings(db)).defaultServings).toBe(4);
  });
});

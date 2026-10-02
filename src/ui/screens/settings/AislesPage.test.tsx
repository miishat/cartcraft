// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';
import type { CartCraftDb } from '../../../data/db';
import { renderRoutes } from '../../../test/render';
import { AislesPage } from './AislesPage';

const routes = [{ path: '/settings/aisles', element: <AislesPage /> }];
const order = async (db: CartCraftDb) => (await db.aisles.orderBy('order').toArray()).map((a) => a.id);

beforeAll(() => {
  const win = document.defaultView as unknown as typeof globalThis;
  if (typeof win.PointerEvent === 'undefined') {
    class TestPointerEvent extends win.MouseEvent {
      pointerId: number;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
      }
    }
    Object.defineProperty(win, 'PointerEvent', { value: TestPointerEvent, configurable: true });
  }
});

describe('Aisles page', () => {
  it('lists the aisles with their emoji badges', async () => {
    renderRoutes(routes, '/settings/aisles');
    const produce = await screen.findByLabelText('Name of Produce');
    expect(produce.closest('li')?.querySelector('[data-aisle-badge]')).toHaveTextContent('🥕');
  });

  it('renames an aisle on blur', async () => {
    const { user, db } = renderRoutes(routes, '/settings/aisles');
    const name = await screen.findByLabelText('Name of Produce');
    await user.clear(name);
    await user.type(name, 'Fruit & Veg');
    await user.tab();
    await waitFor(async () => expect((await db.aisles.get('produce'))?.name).toBe('Fruit & Veg'));
  });

  it('restores the aisle name when it is cleared', async () => {
    const { user, db } = renderRoutes(routes, '/settings/aisles');
    const name = await screen.findByLabelText('Name of Produce');
    await user.clear(name);
    await user.tab();
    expect(name).toHaveValue('Produce');
    expect((await db.aisles.get('produce'))?.name).toBe('Produce');
  });

  it('moves an aisle with the arrow keys and announces it', async () => {
    const { user, db } = renderRoutes(routes, '/settings/aisles');
    const shown = () => screen.getAllByRole('button', { name: /^Reorder / }).map((b) => b.getAttribute('aria-label'));
    const handle = await screen.findByRole('button', { name: 'Reorder Meat & Seafood' });
    handle.focus();
    await user.keyboard('{ArrowUp}');
    // Wait for the rows to re-render before the next key, so the next move starts from the new place.
    await waitFor(() => expect(shown()[0]).toBe('Reorder Meat & Seafood'));
    expect((await order(db))[0]).toBe('meat-seafood');
    expect(await screen.findByText('Meat & Seafood moved to position 1 of 11')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reorder Meat & Seafood' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(shown()[1]).toBe('Reorder Meat & Seafood'));
    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(shown()[2]).toBe('Reorder Meat & Seafood'));
    expect((await order(db)).slice(0, 3)).toEqual(['produce', 'dairy-eggs', 'meat-seafood']);
  });

  it('moves an aisle by dragging its handle', async () => {
    const { db } = renderRoutes(routes, '/settings/aisles');
    const handle = await screen.findByRole('button', { name: 'Reorder Produce' });
    fireEvent.pointerDown(handle, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientY: 196, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientY: 196, pointerId: 1 });
    await waitFor(async () => expect((await order(db)).slice(0, 3)).toEqual(['meat-seafood', 'dairy-eggs', 'produce']));
    expect(await screen.findByText('Produce moved to position 3 of 11')).toBeInTheDocument();
  });

  it('leaves the order alone when a drag is cancelled', async () => {
    const { db } = renderRoutes(routes, '/settings/aisles');
    const before = await order(db);
    const handle = await screen.findByRole('button', { name: 'Reorder Produce' });
    fireEvent.pointerDown(handle, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientY: 300, pointerId: 1 });
    fireEvent.pointerCancel(handle, { pointerId: 1 });
    expect(await order(db)).toEqual(before);
  });
});

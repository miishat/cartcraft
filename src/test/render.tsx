import { render, type RenderResult } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import type { CartCraftDb } from '../data/db';
import { DbProvider } from '../ui/db';
import { createTestDb } from './db';

export interface RouteSpec {
  path: string;
  element: ReactElement;
}

/** Exposes the current path so tests can assert navigation. */
function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

export function renderRoutes(
  routes: RouteSpec[],
  url: string,
  db: CartCraftDb = createTestDb(),
): RenderResult & { db: CartCraftDb; user: UserEvent } {
  const user = userEvent.setup();
  const result = render(
    <DbProvider db={db}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          {routes.map((r) => <Route key={r.path} path={r.path} element={r.element} />)}
          <Route path="*" element={null} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </DbProvider>,
  );
  return { ...result, db, user };
}

import { createContext, useContext, type ReactNode } from 'react';
import type { CartCraftDb } from '../data/db';

const DbContext = createContext<CartCraftDb | null>(null);

export function DbProvider({ db, children }: { db: CartCraftDb; children: ReactNode }) {
  return <DbContext.Provider value={db}>{children}</DbContext.Provider>;
}

export function useDb(): CartCraftDb {
  const db = useContext(DbContext);
  if (!db) throw new Error('useDb must be used inside <DbProvider>');
  return db;
}

import { CartCraftDb } from '../data/db';

let counter = 0;

/** A fresh, isolated database per test (fake-indexeddb is loaded in setup.ts). */
export function createTestDb(): CartCraftDb {
  counter += 1;
  return new CartCraftDb(`cartcraft-test-${counter}-${Math.random().toString(36).slice(2)}`);
}

/** Deterministic id generator for tests: "id-1", "id-2", ... */
export function sequentialIds(prefix = 'id'): () => string {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

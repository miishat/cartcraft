import { itemKey } from '../domain';
import type { CartCraftDb } from '../data/db';

/** Adds a staple by its normalized key ("Black Peppers" -> "black pepper"). Returns the key, or undefined for blank input. */
export async function addPantryStaple(db: CartCraftDb, text: string): Promise<string | undefined> {
  const key = itemKey(text);
  if (!key) return undefined;
  await db.pantryStaples.put({ itemKey: key });
  return key;
}

export async function removePantryStaple(db: CartCraftDb, key: string): Promise<void> {
  await db.pantryStaples.delete(key);
}

export async function renameAisle(db: CartCraftDb, id: string, name: string): Promise<void> {
  if (!name.trim()) throw new Error('Aisle name is required');
  await db.aisles.update(id, { name: name.trim() });
}

/** Swaps an aisle with its neighbor in the shopping order. No-op at either end. */
export async function moveAisle(db: CartCraftDb, id: string, direction: 'up' | 'down'): Promise<void> {
  await db.transaction('rw', db.aisles, async () => {
    const aisles = await db.aisles.orderBy('order').toArray();
    const index = aisles.findIndex((a) => a.id === id);
    const neighbor = aisles[direction === 'up' ? index - 1 : index + 1];
    const current = aisles[index];
    if (!current || !neighbor) return;
    await db.aisles.update(current.id, { order: neighbor.order });
    await db.aisles.update(neighbor.id, { order: current.order });
  });
}

/** Moves an aisle to a position in the shopping order (clamped) and renumbers every aisle. No-op for an unknown id. */
export async function moveAisleTo(db: CartCraftDb, id: string, index: number): Promise<void> {
  await db.transaction('rw', db.aisles, async () => {
    const aisles = await db.aisles.orderBy('order').toArray();
    const from = aisles.findIndex((a) => a.id === id);
    if (from < 0) return;
    const [moved] = aisles.splice(from, 1);
    const to = Math.min(Math.max(0, Math.round(index)), aisles.length);
    aisles.splice(to, 0, moved!);
    await db.aisles.bulkPut(aisles.map((a, order) => ({ ...a, order })));
  });
}

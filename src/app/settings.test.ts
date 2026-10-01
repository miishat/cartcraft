import { describe, expect, it } from 'vitest';
import { createTestDb } from '../test/db';
import { addPantryStaple, moveAisle, removePantryStaple, renameAisle } from './settings';

describe('pantry staples', () => {
  it('adds by normalized key and removes', async () => {
    const db = createTestDb();
    expect(await addPantryStaple(db, '  Garlic Cloves ')).toBe('garlic clove');
    expect(await db.pantryStaples.get('garlic clove')).toEqual({ itemKey: 'garlic clove' });
    await removePantryStaple(db, 'garlic clove');
    expect(await db.pantryStaples.get('garlic clove')).toBeUndefined();
  });

  it('ignores blank input', async () => {
    const db = createTestDb();
    expect(await addPantryStaple(db, '   ')).toBeUndefined();
  });
});

describe('aisles', () => {
  const order = async (db: ReturnType<typeof createTestDb>) => (await db.aisles.orderBy('order').toArray()).map((a) => a.id);

  it('moves an aisle up and down', async () => {
    const db = createTestDb();
    await moveAisle(db, 'dairy-eggs', 'up');
    expect((await order(db)).slice(0, 3)).toEqual(['produce', 'dairy-eggs', 'meat-seafood']);
    await moveAisle(db, 'produce', 'down');
    expect((await order(db)).slice(0, 3)).toEqual(['dairy-eggs', 'produce', 'meat-seafood']);
  });

  it('does nothing at the ends', async () => {
    const db = createTestDb();
    const before = await order(db);
    await moveAisle(db, 'produce', 'up');
    await moveAisle(db, 'other', 'down');
    expect(await order(db)).toEqual(before);
  });

  it('renames an aisle and rejects blank names', async () => {
    const db = createTestDb();
    await renameAisle(db, 'produce', ' Fruit & Veg ');
    expect((await db.aisles.get('produce'))?.name).toBe('Fruit & Veg');
    await expect(renameAisle(db, 'produce', ' ')).rejects.toThrow();
  });
});

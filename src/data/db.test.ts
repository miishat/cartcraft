import { describe, expect, it } from 'vitest';
import { DEFAULT_AISLES } from '../domain';
import { createTestDb } from '../test/db';
import { DEFAULT_PANTRY, DEFAULT_SETTINGS, getSettings, updateSettings } from './db';

describe('CartCraftDb', () => {
  it('seeds aisles in default order, pantry staples and settings on first open', async () => {
    const db = createTestDb();
    const aisles = await db.aisles.orderBy('order').toArray();
    expect(aisles.map((a) => a.id)).toEqual(DEFAULT_AISLES.map((a) => a.id));
    expect((await db.pantryStaples.toArray()).map((p) => p.itemKey).sort()).toEqual([...DEFAULT_PANTRY].sort());
    expect(await getSettings(db)).toEqual(DEFAULT_SETTINGS);
  });

  it('updates settings without touching other fields', async () => {
    const db = createTestDb();
    await updateSettings(db, { unitSystem: 'metric' });
    expect(await getSettings(db)).toEqual({ ...DEFAULT_SETTINGS, unitSystem: 'metric' });
  });

  it('keeps secrets in their own table', async () => {
    const db = createTestDb();
    await db.secrets.put({ id: 'secrets', llmApiKey: 'sk-test' });
    expect((await db.secrets.get('secrets'))?.llmApiKey).toBe('sk-test');
  });
});

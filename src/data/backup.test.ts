import { describe, expect, it } from 'vitest';
import { createList } from '../app/lists';
import { draftLinesFromText, saveRecipe } from '../app/recipes';
import { createTestDb, sequentialIds } from '../test/db';
import {
  BACKUP_SCHEMA_VERSION, backupFileName, exportBackup, hasUndoSnapshot, importBackup, parseBackup,
  readBackupData, serializeBackup, stripSecrets, summarizeBackup, undoLastImport,
} from './backup';
import { updateSettings, type CartCraftDb } from './db';

async function seeded(title = 'Tacos'): Promise<CartCraftDb> {
  const db = createTestDb();
  const ids = sequentialIds(title);
  const recipeId = await saveRecipe(db, { title, rawText: '2 onions', baseServings: 4, ingredients: draftLinesFromText('2 onions\n1 lb beef', ids) }, 1, ids);
  await createList(db, [{ recipeId, targetServings: 4 }], 2, ids);
  await db.aisleOverrides.put({ itemKey: 'onion', aisleId: 'frozen', source: 'user' });
  await db.secrets.put({ id: 'secrets', llmApiKey: 'sk-live-secret' });
  return db;
}

describe('exportBackup', () => {
  it('wraps all exportable data in a versioned envelope and never includes the key', async () => {
    const db = await seeded();
    const file = await exportBackup(db, 1234);
    expect(file).toMatchObject({ format: 'cartcraft', schemaVersion: BACKUP_SCHEMA_VERSION, exportedAt: 1234 });
    expect(summarizeBackup(file.data)).toEqual({ recipes: 1, lists: 1, pantryStaples: 5, aisleOverrides: 1 });
    expect(file.data.aisles).toHaveLength(11);
    expect(file.data.settings).toHaveLength(1);
    expect(serializeBackup(file)).not.toContain('sk-live-secret');
  });

  it('names files by date', () => {
    expect(backupFileName(Date.UTC(2026, 9, 1))).toBe('cartcraft-backup-2026-10-01.json');
  });
});

describe('recipe steps', () => {
  it('survive an export and parse round trip', async () => {
    const db = await seeded();
    const [recipe] = await db.recipes.toArray();
    await db.recipes.put({ ...recipe!, steps: [{ text: 'Boil rice', isHeader: false }] });
    const result = parseBackup(serializeBackup(await exportBackup(db, 1)));
    expect(result.ok && result.backup.data.recipes[0]?.steps).toEqual([{ text: 'Boil rice', isHeader: false }]);
  });
});

describe('stripSecrets', () => {
  it('drops credential-like keys at any depth and keeps itemKey', () => {
    expect(stripSecrets({ itemKey: 'onion', apiKey: 'x', nested: [{ llmApiKey: 'y', token: 'z', name: 'ok' }] }))
      .toEqual({ itemKey: 'onion', nested: [{ name: 'ok' }] });
  });
});

describe('parseBackup', () => {
  it('round-trips an export', async () => {
    const db = await seeded();
    const file = await exportBackup(db, 1);
    const result = parseBackup(serializeBackup(file));
    expect(result.ok && result.backup.data).toEqual(file.data);
  });

  it.each([
    ['not json', 'not_json'],
    [JSON.stringify({ format: 'other', schemaVersion: 1, data: {} }), 'wrong_format'],
    [JSON.stringify({ format: 'cartcraft', schemaVersion: 99, data: {} }), 'newer_version'],
    [JSON.stringify({ format: 'cartcraft', schemaVersion: 1, data: { recipes: 'nope' } }), 'invalid'],
    [JSON.stringify({ format: 'cartcraft', schemaVersion: '1', data: {} }), 'invalid'],
  ])('rejects %s', (text, error) => {
    const result = parseBackup(text);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toBe(error);
  });

  it('strips unknown fields such as an injected key', async () => {
    const db = await seeded();
    const file = await exportBackup(db, 1);
    const tampered = JSON.parse(serializeBackup(file));
    tampered.data.settings[0].llmApiKey = 'stolen';
    const result = parseBackup(JSON.stringify(tampered));
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result.ok && result.backup)).not.toContain('stolen');
  });
});

describe('importBackup and undoLastImport', () => {
  it('replaces data, keeps secrets, and can be undone exactly', async () => {
    const source = await seeded('Soup');
    await updateSettings(source, { unitSystem: 'metric' });
    const backup = await exportBackup(source, 1);

    const target = await seeded('Tacos');
    const before = await readBackupData(target);

    await importBackup(target, backup, 99);
    expect((await target.recipes.toArray()).map((r) => r.title)).toEqual(['Soup']);
    expect((await target.settings.get('settings'))?.unitSystem).toBe('metric');
    expect((await target.secrets.get('secrets'))?.llmApiKey).toBe('sk-live-secret');
    expect(await hasUndoSnapshot(target)).toBe(true);

    expect(await undoLastImport(target)).toBe(true);
    expect(await readBackupData(target)).toEqual(before);
    expect(await hasUndoSnapshot(target)).toBe(false);
    expect(await undoLastImport(target)).toBe(false);
  });
});

describe('parseBackup integrity', () => {
  async function exported() {
    const db = await seeded();
    return JSON.parse(serializeBackup(await exportBackup(db, 1)));
  }

  it('rejects duplicate ids instead of failing during import', async () => {
    const file = await exported();
    file.data.recipes.push({ ...file.data.recipes[0] });
    const result = parseBackup(JSON.stringify(file));
    expect(result).toEqual({ ok: false, error: 'invalid', detail: 'duplicate recipes.id' });
  });

  it('restores a missing Other aisle and missing settings', async () => {
    const file = await exported();
    file.data.aisles = file.data.aisles.filter((a: { id: string }) => a.id !== 'other');
    file.data.settings = [];
    const result = parseBackup(JSON.stringify(file));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const other = result.backup.data.aisles.find((a) => a.id === 'other');
    expect(other).toEqual({ id: 'other', name: 'Other', order: 10 });
    expect(result.backup.data.settings).toHaveLength(1);
  });
});

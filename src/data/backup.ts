import { OTHER_AISLE } from '../domain';
import { BackupDataSchema } from './backupSchema';
import { DEFAULT_SETTINGS, type CartCraftDb } from './db';
import type { BackupData } from './types';

export const BACKUP_FORMAT = 'cartcraft';
export const BACKUP_SCHEMA_VERSION = 1;
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  schemaVersion: number;
  exportedAt: number;
  data: BackupData;
}

export type ParseResult =
  | { ok: true; backup: BackupFile }
  | { ok: false; error: 'too_large' | 'not_json' | 'wrong_format' | 'newer_version' | 'invalid'; detail?: string };

/**
 * Upgrades data written by older schema versions, one step at a time.
 * Key n migrates version n data to version n + 1. Empty while only version 1 exists.
 */
const MIGRATIONS: Record<number, (data: unknown) => unknown> = {};

const SECRET_KEY = /^(?:.*api[-_]?key|key|token|.*secret|password|access[-_]?token)$/i;

/** Defense in depth: drop any property that looks like a credential, at any depth. */
export function stripSecrets<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripSecrets) as T;
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k]) => !SECRET_KEY.test(k))
        .map(([k, v]) => [k, stripSecrets(v)]),
    ) as T;
  }
  return value;
}

/** Reads every exportable table. Never touches `secrets` or `snapshots`. */
export async function readBackupData(db: CartCraftDb): Promise<BackupData> {
  return db.transaction('r', [db.recipes, db.lists, db.pantryStaples, db.aisles, db.aisleOverrides, db.settings], async () => ({
    recipes: await db.recipes.toArray(),
    lists: await db.lists.toArray(),
    pantryStaples: await db.pantryStaples.toArray(),
    aisles: await db.aisles.toArray(),
    aisleOverrides: await db.aisleOverrides.toArray(),
    settings: await db.settings.toArray(),
  }));
}

export async function exportBackup(db: CartCraftDb, now: number): Promise<BackupFile> {
  return {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: now,
    data: stripSecrets(await readBackupData(db)),
  };
}

export function serializeBackup(file: BackupFile): string {
  return JSON.stringify(file, null, 2);
}

export function backupFileName(now: number): string {
  return `cartcraft-backup-${new Date(now).toISOString().slice(0, 10)}.json`;
}

/** Never trusts the file: size cap, JSON parse, format and version checks, migrations, then schema validation. */
export function parseBackup(text: string): ParseResult {
  if (text.length > MAX_BACKUP_BYTES) return { ok: false, error: 'too_large' };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'not_json' };
  }
  if (typeof raw !== 'object' || raw === null || (raw as { format?: unknown }).format !== BACKUP_FORMAT) {
    return { ok: false, error: 'wrong_format' };
  }
  const envelope = raw as { schemaVersion?: unknown; exportedAt?: unknown; data?: unknown };
  const version = envelope.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) return { ok: false, error: 'invalid', detail: 'schemaVersion' };
  if (version > BACKUP_SCHEMA_VERSION) return { ok: false, error: 'newer_version' };

  let data = envelope.data;
  for (let v = version; v < BACKUP_SCHEMA_VERSION; v++) {
    const migrate = MIGRATIONS[v];
    if (!migrate) return { ok: false, error: 'invalid', detail: `no migration from version ${v}` };
    data = migrate(data);
  }

  const parsed = BackupDataSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: 'invalid', detail: parsed.error.issues[0]?.path.join('.') };
  }
  const duplicate = firstDuplicateKey(parsed.data);
  if (duplicate) return { ok: false, error: 'invalid', detail: `duplicate ${duplicate}` };
  return {
    ok: true,
    backup: {
      format: BACKUP_FORMAT,
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: typeof envelope.exportedAt === 'number' ? envelope.exportedAt : 0,
      data: withRequiredRecords(parsed.data),
    },
  };
}

/** bulkAdd fails on duplicate keys, so a crafted or corrupted file is rejected up front. */
function firstDuplicateKey(data: BackupData): string | undefined {
  const keys: [string, string[]][] = [
    ['recipes.id', data.recipes.map((r) => r.id)],
    ['lists.id', data.lists.map((l) => l.id)],
    ['pantryStaples.itemKey', data.pantryStaples.map((p) => p.itemKey)],
    ['aisles.id', data.aisles.map((a) => a.id)],
    ['aisleOverrides.itemKey', data.aisleOverrides.map((o) => o.itemKey)],
  ];
  return keys.find(([, values]) => new Set(values).size !== values.length)?.[0];
}

/** The app needs an Other aisle (for unknown items) and a settings record; restore them if missing. */
function withRequiredRecords(data: BackupData): BackupData {
  const aisles = data.aisles.some((a) => a.id === OTHER_AISLE)
    ? data.aisles
    : [...data.aisles, { id: OTHER_AISLE, name: 'Other', order: Math.max(-1, ...data.aisles.map((a) => a.order)) + 1 }];
  const settings = data.settings.length > 0 ? data.settings : [DEFAULT_SETTINGS];
  return { ...data, aisles, settings };
}

export interface BackupSummary {
  recipes: number;
  lists: number;
  pantryStaples: number;
  aisleOverrides: number;
}

export function summarizeBackup(data: BackupData): BackupSummary {
  return {
    recipes: data.recipes.length,
    lists: data.lists.length,
    pantryStaples: data.pantryStaples.length,
    aisleOverrides: data.aisleOverrides.length,
  };
}

async function replaceAll(db: CartCraftDb, data: BackupData): Promise<void> {
  await Promise.all([
    db.recipes.clear(), db.lists.clear(), db.pantryStaples.clear(),
    db.aisles.clear(), db.aisleOverrides.clear(), db.settings.clear(),
  ]);
  await Promise.all([
    db.recipes.bulkAdd(data.recipes),
    db.lists.bulkAdd(data.lists),
    db.pantryStaples.bulkAdd(data.pantryStaples),
    db.aisles.bulkAdd(data.aisles),
    db.aisleOverrides.bulkAdd(data.aisleOverrides),
    db.settings.bulkAdd(data.settings),
  ]);
}

const ALL_TABLES = (db: CartCraftDb) =>
  [db.recipes, db.lists, db.pantryStaples, db.aisles, db.aisleOverrides, db.settings, db.snapshots];

/** Snapshots current data, then replaces every exportable table in one transaction. Secrets are untouched. */
export async function importBackup(db: CartCraftDb, backup: BackupFile, now: number): Promise<void> {
  await db.transaction('rw', ALL_TABLES(db), async () => {
    const current = await readBackupData(db);
    await db.snapshots.put({ id: 'last-import', takenAt: now, data: current });
    await replaceAll(db, backup.data);
  });
}

export async function hasUndoSnapshot(db: CartCraftDb): Promise<boolean> {
  return (await db.snapshots.get('last-import')) !== undefined;
}

/** Restores the data from before the last import. Returns false when there is nothing to undo. */
export async function undoLastImport(db: CartCraftDb): Promise<boolean> {
  return db.transaction('rw', ALL_TABLES(db), async () => {
    const snapshot = await db.snapshots.get('last-import');
    if (!snapshot) return false;
    await replaceAll(db, snapshot.data);
    await db.snapshots.delete('last-import');
    return true;
  });
}

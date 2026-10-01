import Dexie, { type EntityTable, type Transaction } from 'dexie';
import { DEFAULT_AISLES } from '../domain';
import type {
  Aisle, AisleOverride, PantryStaple, Recipe, Secrets, Settings, ShoppingList, Snapshot,
} from './types';

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  unitSystem: 'us',
  defaultServings: 4,
  llm: { providerId: 'deepseek', model: '' },
  keepScreenOn: false,
};

export const DEFAULT_PANTRY = ['salt', 'black pepper', 'water', 'olive oil', 'vegetable oil'];

export class CartCraftDb extends Dexie {
  recipes!: EntityTable<Recipe, 'id'>;
  lists!: EntityTable<ShoppingList, 'id'>;
  pantryStaples!: EntityTable<PantryStaple, 'itemKey'>;
  aisles!: EntityTable<Aisle, 'id'>;
  aisleOverrides!: EntityTable<AisleOverride, 'itemKey'>;
  settings!: EntityTable<Settings, 'id'>;
  secrets!: EntityTable<Secrets, 'id'>;
  snapshots!: EntityTable<Snapshot, 'id'>;

  constructor(name = 'cartcraft') {
    super(name);
    this.version(1).stores({
      recipes: 'id, title, updatedAt',
      lists: 'id, createdAt',
      pantryStaples: 'itemKey',
      aisles: 'id, order',
      aisleOverrides: 'itemKey',
      settings: 'id',
      secrets: 'id',
      snapshots: 'id',
    });
    this.on('populate', (tx) => seedDefaults(tx));
  }
}

/** Runs once, when the database is first created. */
export function seedDefaults(tx: Transaction): void {
  void tx.table('aisles').bulkAdd(DEFAULT_AISLES.map((a, order) => ({ ...a, order })));
  void tx.table('pantryStaples').bulkAdd(DEFAULT_PANTRY.map((itemKey) => ({ itemKey })));
  void tx.table('settings').add(DEFAULT_SETTINGS);
}

export async function getSettings(db: CartCraftDb): Promise<Settings> {
  return (await db.settings.get('settings')) ?? DEFAULT_SETTINGS;
}

export async function updateSettings(db: CartCraftDb, patch: Partial<Omit<Settings, 'id'>>): Promise<void> {
  const current = await getSettings(db);
  await db.settings.put({ ...current, ...patch, id: 'settings' });
}

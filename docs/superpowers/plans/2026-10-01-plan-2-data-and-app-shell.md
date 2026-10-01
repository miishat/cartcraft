# CartCraft Plan 2: Data and App Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the old AI Studio UI with the real CartCraft app: local IndexedDB storage, recipe add/edit with a review table, recipe selection with per-recipe servings, saved shopping lists in shopping mode, settings, and backup export/import with undo. No LLM and no URL import yet (Plans 3 and 4).

**Architecture:** `src/data/` holds the Dexie schema and the backup format. `src/app/` holds use cases that combine the Plan 1 domain with storage; they take `db`, `now` and `makeId` as arguments so tests are deterministic. `src/ui/` holds React screens that read live data with `useLiveQuery` and call use cases. Screens are built and tested in isolation first; the last task wires the router, layout and Tailwind and deletes the old UI, so the old app keeps building until then.

**Tech Stack:** React 19, React Router 7, Dexie 4 + dexie-react-hooks 4, Zod 4, Tailwind CSS 4 (`@tailwindcss/vite`), lucide-react, Vitest 3, Testing Library (React 16, user-event 14, jest-dom 7), jsdom 26, fake-indexeddb 6.

**Spec:** [2026-10-01-cartcraft-rewrite-design.md](../specs/2026-10-01-cartcraft-rewrite-design.md), sections 3, 4.2, 6, 9.1, 9.2, 10.2. **Roadmap:** [2026-10-01-roadmap.md](2026-10-01-roadmap.md). **Requires:** Plan 1 completed (`src/domain/` with 196 passing tests).

## Global Constraints

- Layers: `ui/` may import `app/`, `data/`, `domain/`; `app/` may import `data/`, `domain/`; `data/` may import `domain/`; `domain/` imports none of them.
- Use cases take `db: CartCraftDb`, and `now: number` and `makeId: () => string` where they create records. Only `src/app/ids.ts` (`crypto.randomUUID`) and screen defaults (`Date.now`) produce real ids and times.
- Lists are snapshots: building a list copies items in; editing a recipe later never changes a list.
- The `secrets` table is never read by backup code, and exports never contain an API key.
- Import replaces all exportable data only after the user confirms, and always snapshots the previous data first so "Undo last import" can restore it.
- Version pins (Node 22.13 on this machine): `react-router@^7.18.4` (v8 needs Node 22.22+), `jsdom@^26.1.0` (v30 needs Node 22.22+).
- Do not use em dashes in code comments, docs or UI copy.
- Run commands from the repo root `C:\Users\misha\cartcraft` in Git Bash.
- UI test files start with `// @vitest-environment jsdom`; data and app tests run in the default node environment with fake-indexeddb.

## File Structure

| File | Responsibility |
|---|---|
| `vitest.config.ts` (modify) | include `.tsx` tests, setup file |
| `src/test/setup.ts` | fake-indexeddb, jest-dom matchers, cleanup |
| `src/test/db.ts` | `createTestDb()`, `sequentialIds()` |
| `src/test/render.tsx` | `renderRoutes()` with MemoryRouter, DbProvider and a location probe |
| `src/data/types.ts` | stored record types (spec 4.2) |
| `src/data/db.ts` | Dexie schema v1, seed defaults, settings helpers |
| `src/data/backupSchema.ts` | Zod schemas for every exportable record |
| `src/data/backup.ts` | export envelope, parse/migrate/validate, import with snapshot, undo |
| `src/app/ids.ts` | `newId()` |
| `src/app/recipes.ts` | draft lines from text, save/delete recipe, request storage persistence |
| `src/app/lists.ts` | build list snapshot, check/uncheck, ad-hoc add, edit, delete, move to aisle, rename, delete list |
| `src/app/listView.ts` | group items into aisle sections, pantry, in cart; plain-text export |
| `src/app/settings.ts` | pantry staples, aisle rename and reorder |
| `src/ui/db.tsx` | `DbProvider`, `useDb()` |
| `src/ui/hooks.ts` | `useSettings()`, `useAisles()` |
| `src/ui/components/ServingsStepper.tsx` | +/- servings control |
| `src/ui/components/ReviewTable.tsx` | editable parsed-line review |
| `src/ui/components/ListItemRow.tsx` | one shopping row with options |
| `src/ui/screens/RecipeEditorScreen.tsx` | add and edit recipe |
| `src/ui/screens/RecipesScreen.tsx` | search, select, servings, build list |
| `src/ui/screens/ListsScreen.tsx` | list history |
| `src/ui/screens/ListScreen.tsx` | shopping mode |
| `src/ui/screens/SettingsScreen.tsx` | units, servings, pantry, aisles, backup, storage |
| `src/ui/Layout.tsx`, `src/ui/App.tsx`, `src/main.tsx`, `src/index.css` | shell, routes, entry, Tailwind |
| `index.html`, `vite.config.ts`, `tsconfig.json` (modify) | new entry, Tailwind plugin, drop the `@` alias |
| Delete | `App.tsx`, `index.tsx`, `components/`, `constants.ts`, `types.ts`, `services/` |

---

### Task 1: Storage schema and test setup

**Files:**
- Modify: `package.json` (dependencies), `vitest.config.ts`
- Create: `src/test/setup.ts`, `src/test/db.ts`, `src/data/types.ts`, `src/data/db.ts`
- Test: `src/data/db.test.ts`

**Interfaces:**
- Consumes: `DEFAULT_AISLES`, `IngredientLine`, `ListItem`, `UnitSystem` from `src/domain`.
- Produces: record types `Recipe`, `ListSource`, `ListExtras`, `ShoppingList`, `PantryStaple`, `Aisle`, `AisleOverride`, `Settings`, `Secrets`, `BackupData`, `Snapshot`; `class CartCraftDb` (tables `recipes`, `lists`, `pantryStaples`, `aisles`, `aisleOverrides`, `settings`, `secrets`, `snapshots`), `DEFAULT_SETTINGS`, `DEFAULT_PANTRY`, `seedDefaults(tx)`, `getSettings(db): Promise<Settings>`, `updateSettings(db, patch): Promise<void>`; test helpers `createTestDb(): CartCraftDb`, `sequentialIds(prefix?): () => string`.

- [ ] **Step 1: Install dependencies**

```bash
npm install dexie@^4.4.6 dexie-react-hooks@^4.4.0 zod@^4.6.5 react-router@^7.18.4
npm install -D tailwindcss@^4.3.3 @tailwindcss/vite@^4.3.3 fake-indexeddb@^6.2.5 jsdom@^26.1.0 @testing-library/react@^16.3.3 @testing-library/user-event@^14.6.7 @testing-library/jest-dom@^7.0.1 @testing-library/dom@^10 @types/react @types/react-dom
```

Expected: both finish with "added N packages" and no errors.

- [ ] **Step 2: Replace `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
    setupFiles: ['src/test/setup.ts'],
  },
});
```

- [ ] **Step 3: Create `src/test/setup.ts`**

```ts
import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
```

- [ ] **Step 4: Create `src/test/db.ts`**

```ts
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
```

- [ ] **Step 5: Create `src/data/types.ts`**

```ts
import type { IngredientLine, ListItem, UnitSystem } from '../domain';

export interface Recipe {
  id: string;
  title: string;
  sourceUrl?: string;
  rawText: string;
  baseServings: number;
  yieldText?: string;
  ingredients: IngredientLine[];
  createdAt: number;
  updatedAt: number;
}

export interface ListSource {
  recipeId: string;
  title: string;
  targetServings: number;
}

export interface ListExtras {
  swaps: { item: string; swap: string }[];
  tips: string[];
  generatedAt: number;
}

export interface ShoppingList {
  id: string;
  name: string;
  createdAt: number;
  sources: ListSource[];
  items: ListItem[];
  extras?: ListExtras;
}

export interface PantryStaple {
  itemKey: string;
}

export interface Aisle {
  id: string;
  name: string;
  order: number;
}

export interface AisleOverride {
  itemKey: string;
  aisleId: string;
  source: 'user' | 'llm';
}

export interface Settings {
  id: 'settings';
  unitSystem: UnitSystem;
  defaultServings: number;
  llm: { providerId: string; model: string };
  keepScreenOn: boolean;
  persistGranted?: boolean;
}

/** Never exported, never read by backup code. */
export interface Secrets {
  id: 'secrets';
  llmApiKey?: string;
}

/** Everything a backup file carries. */
export interface BackupData {
  recipes: Recipe[];
  lists: ShoppingList[];
  pantryStaples: PantryStaple[];
  aisles: Aisle[];
  aisleOverrides: AisleOverride[];
  settings: Settings[];
}

export interface Snapshot {
  id: 'last-import';
  takenAt: number;
  data: BackupData;
}
```

- [ ] **Step 6: Write the failing test `src/data/db.test.ts`**

```ts
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
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npx vitest run src/data/db.test.ts`
Expected: FAIL, "Failed to resolve import "./db"" (or from `src/test/db.ts`).

- [ ] **Step 8: Implement `src/data/db.ts`**

```ts
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
```

- [ ] **Step 9: Run tests and typecheck**

Run: `npm test && npm run typecheck`
Expected: all tests PASS (Plan 1's 196 plus 3 new); `tsc` prints nothing.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/test src/data
git commit -m "feat(data): add IndexedDB schema with seeded aisles, pantry and settings"
```

---

### Task 2: Recipe and list use cases

**Files:**
- Create: `src/app/ids.ts`, `src/app/recipes.ts`, `src/app/lists.ts`
- Test: `src/app/recipes.test.ts`, `src/app/lists.test.ts`

**Interfaces:**
- Consumes: `parseIngredientLine`, `buildListItems`, `classifyAisle`, `OTHER_AISLE`, `IngredientLine`, `ListItem`, `Amount` from `src/domain`; `CartCraftDb`, `updateSettings` from `src/data/db`; `Recipe`, `ShoppingList` from `src/data/types`.
- Produces:
  - `newId(): string`
  - `RecipeInput { id?; title; sourceUrl?; rawText; baseServings; yieldText?; ingredients: IngredientLine[] }`, `draftLinesFromText(text, makeId): IngredientLine[]`, `reparseLine(line, raw): IngredientLine`, `class RecipeValidationError`, `saveRecipe(db, input, now, makeId): Promise<string>`, `deleteRecipe(db, id)`, `requestPersistence(db, storage?): Promise<boolean | undefined>`
  - `Selection { recipeId; targetServings }`, `defaultListName(now): string`, `createList(db, selections, now, makeId): Promise<string>`, `setItemChecked(db, listId, itemId, checked, now)`, `addAdhocItem(db, listId, text, makeId): Promise<string>`, `editItem(db, listId, itemId, text)`, `deleteItem(db, listId, itemId)`, `moveItemToAisle(db, listId, itemId, aisleId)`, `renameList(db, listId, name)`, `deleteList(db, listId)`

- [ ] **Step 1: Write the failing tests**

`src/app/recipes.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { getSettings } from '../data/db';
import { createTestDb, sequentialIds } from '../test/db';
import {
  RecipeValidationError, deleteRecipe, draftLinesFromText, reparseLine, requestPersistence, saveRecipe,
} from './recipes';

describe('draftLinesFromText', () => {
  it('parses each non-blank line with a fresh id', () => {
    const lines = draftLinesFromText('2 cups flour\n\n  \n3 eggs\r\n', sequentialIds('line'));
    expect(lines.map((l) => [l.id, l.itemKey])).toEqual([['line-1', 'flour'], ['line-2', 'egg']]);
  });
});

describe('reparseLine', () => {
  it('keeps the id', () => {
    const [line] = draftLinesFromText('2 cups flour', sequentialIds());
    const edited = reparseLine(line!, '3 cups sugar');
    expect(edited.id).toBe(line!.id);
    expect(edited.itemKey).toBe('sugar');
  });
});

describe('saveRecipe', () => {
  const input = {
    title: '  Pancakes ',
    rawText: '2 cups flour',
    baseServings: 4,
    ingredients: draftLinesFromText('2 cups flour', sequentialIds('line')),
  };

  it('creates a recipe with timestamps and a trimmed title', async () => {
    const db = createTestDb();
    const id = await saveRecipe(db, input, 1000, sequentialIds('recipe'));
    expect(id).toBe('recipe-1');
    expect(await db.recipes.get(id)).toMatchObject({ title: 'Pancakes', baseServings: 4, createdAt: 1000, updatedAt: 1000 });
  });

  it('updates an existing recipe and keeps createdAt', async () => {
    const db = createTestDb();
    const id = await saveRecipe(db, input, 1000, sequentialIds('recipe'));
    await saveRecipe(db, { ...input, id, title: 'Crepes' }, 2000, sequentialIds('unused'));
    expect(await db.recipes.get(id)).toMatchObject({ title: 'Crepes', createdAt: 1000, updatedAt: 2000 });
    expect(await db.recipes.count()).toBe(1);
  });

  it.each([
    [{ title: '   ' }],
    [{ baseServings: 0 }],
    [{ baseServings: Number.NaN }],
  ])('rejects %j', async (patch) => {
    const db = createTestDb();
    await expect(saveRecipe(db, { ...input, ...patch }, 1, sequentialIds())).rejects.toBeInstanceOf(RecipeValidationError);
  });

  it('deletes a recipe', async () => {
    const db = createTestDb();
    const id = await saveRecipe(db, input, 1, sequentialIds());
    await deleteRecipe(db, id);
    expect(await db.recipes.count()).toBe(0);
  });
});

describe('requestPersistence', () => {
  it('records the result in settings', async () => {
    const db = createTestDb();
    const storage = { persisted: vi.fn(async () => false), persist: vi.fn(async () => true) };
    expect(await requestPersistence(db, storage)).toBe(true);
    expect((await getSettings(db)).persistGranted).toBe(true);
  });

  it('does nothing when the API is missing', async () => {
    const db = createTestDb();
    expect(await requestPersistence(db, undefined)).toBeUndefined();
    expect((await getSettings(db)).persistGranted).toBeUndefined();
  });
});
```

`src/app/lists.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatAmounts } from '../domain';
import type { CartCraftDb } from '../data/db';
import { createTestDb, sequentialIds } from '../test/db';
import {
  addAdhocItem, createList, defaultListName, deleteItem, deleteList, editItem, moveItemToAisle,
  renameList, setItemChecked,
} from './lists';
import { draftLinesFromText, saveRecipe } from './recipes';

async function addRecipe(db: CartCraftDb, title: string, text: string, baseServings = 4): Promise<string> {
  const ids = sequentialIds(title);
  return saveRecipe(db, { title, rawText: text, baseServings, ingredients: draftLinesFromText(text, ids) }, 1, ids);
}

async function setup() {
  const db = createTestDb();
  const tacos = await addRecipe(db, 'Tacos', '1 lb ground beef\n1 onion\nSalt, to taste');
  const soup = await addRecipe(db, 'Soup', '2 onions\n4 cups chicken broth', 2);
  return { db, tacos, soup };
}

describe('createList', () => {
  it('builds a named snapshot from the selected recipes with per-recipe servings', async () => {
    const { db, tacos, soup } = await setup();
    const now = Date.UTC(2026, 9, 1, 12);
    const id = await createList(db, [{ recipeId: tacos, targetServings: 4 }, { recipeId: soup, targetServings: 4 }], now, sequentialIds('x'));
    const list = (await db.lists.get(id))!;
    expect(list.name).toBe(defaultListName(now));
    expect(list.sources).toEqual([
      { recipeId: tacos, title: 'Tacos', targetServings: 4 },
      { recipeId: soup, title: 'Soup', targetServings: 4 },
    ]);
    const byKey = Object.fromEntries(list.items.map((i) => [i.itemKey, i]));
    expect(formatAmounts(byKey.onion!.amounts, 'us')).toBe('5');
    expect(formatAmounts(byKey['chicken broth']!.amounts, 'us')).toBe('8 cups');
    expect(byKey.onion!.aisleId).toBe('produce');
    expect(byKey.salt!.group).toBe('pantry');
  });

  it('uses saved aisle overrides', async () => {
    const { db, tacos } = await setup();
    await db.aisleOverrides.put({ itemKey: 'onion', aisleId: 'frozen', source: 'user' });
    const id = await createList(db, [{ recipeId: tacos, targetServings: 4 }], 1, sequentialIds());
    expect((await db.lists.get(id))!.items.find((i) => i.itemKey === 'onion')!.aisleId).toBe('frozen');
  });

  it('is not changed by later recipe edits', async () => {
    const { db, tacos } = await setup();
    const id = await createList(db, [{ recipeId: tacos, targetServings: 4 }], 1, sequentialIds());
    await db.recipes.update(tacos, { title: 'Changed', ingredients: [] });
    const list = (await db.lists.get(id))!;
    expect(list.sources[0]!.title).toBe('Tacos');
    expect(list.items.length).toBe(3);
  });

  it('rejects an empty selection', async () => {
    const { db } = await setup();
    await expect(createList(db, [], 1, sequentialIds())).rejects.toThrow('No recipes selected');
  });
});

describe('list edits', () => {
  async function withList() {
    const { db, tacos } = await setup();
    const listId = await createList(db, [{ recipeId: tacos, targetServings: 4 }], 1, sequentialIds('item'));
    const onion = (await db.lists.get(listId))!.items.find((i) => i.itemKey === 'onion')!;
    return { db, listId, onion };
  }

  it('checks and unchecks an item', async () => {
    const { db, listId, onion } = await withList();
    await setItemChecked(db, listId, onion.id, true, 500);
    expect((await db.lists.get(listId))!.items.find((i) => i.id === onion.id)).toMatchObject({ checked: true, checkedAt: 500 });
    await setItemChecked(db, listId, onion.id, false, 600);
    const item = (await db.lists.get(listId))!.items.find((i) => i.id === onion.id)!;
    expect(item.checked).toBe(false);
    expect(item.checkedAt).toBeUndefined();
  });

  it('adds a parsed, classified ad-hoc item', async () => {
    const { db, listId } = await withList();
    const id = await addAdhocItem(db, listId, '2 lb apples', sequentialIds('adhoc'));
    const item = (await db.lists.get(listId))!.items.find((i) => i.id === id)!;
    expect(item).toMatchObject({ name: 'apples', itemKey: 'apple', aisleId: 'produce', origin: 'adhoc', checked: false });
    expect(formatAmounts(item.amounts, 'us')).toBe('2 lb');
  });

  it('adds an unknown ad-hoc item to Other', async () => {
    const { db, listId } = await withList();
    const id = await addAdhocItem(db, listId, 'birthday candles', sequentialIds('adhoc'));
    expect((await db.lists.get(listId))!.items.find((i) => i.id === id)!.aisleId).toBe('other');
  });

  it('edits an item from text and keeps its aisle and check state', async () => {
    const { db, listId, onion } = await withList();
    await setItemChecked(db, listId, onion.id, true, 1);
    await editItem(db, listId, onion.id, '3 red onions');
    const item = (await db.lists.get(listId))!.items.find((i) => i.id === onion.id)!;
    expect(item).toMatchObject({ name: 'red onions', itemKey: 'red onion', aisleId: 'produce', checked: true });
    expect(formatAmounts(item.amounts, 'us')).toBe('3');
  });

  it('deletes an item', async () => {
    const { db, listId, onion } = await withList();
    await deleteItem(db, listId, onion.id);
    expect((await db.lists.get(listId))!.items.some((i) => i.id === onion.id)).toBe(false);
  });

  it('moves an item and remembers the aisle', async () => {
    const { db, listId, onion } = await withList();
    await moveItemToAisle(db, listId, onion.id, 'frozen');
    expect((await db.lists.get(listId))!.items.find((i) => i.id === onion.id)!.aisleId).toBe('frozen');
    expect(await db.aisleOverrides.get('onion')).toEqual({ itemKey: 'onion', aisleId: 'frozen', source: 'user' });
  });

  it('renames and deletes a list', async () => {
    const { db, listId } = await withList();
    await renameList(db, listId, '  Weekend ');
    expect((await db.lists.get(listId))!.name).toBe('Weekend');
    await deleteList(db, listId);
    expect(await db.lists.count()).toBe(0);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/app`
Expected: FAIL, imports `./recipes` and `./lists` cannot be resolved.

- [ ] **Step 3: Create `src/app/ids.ts`**

```ts
/** Random ids for records created in the browser. Domain code never calls this; ids are passed in. */
export function newId(): string {
  return crypto.randomUUID();
}
```

- [ ] **Step 4: Implement `src/app/recipes.ts`**

```ts
import { parseIngredientLine, type IngredientLine } from '../domain';
import { updateSettings, type CartCraftDb } from '../data/db';
import type { Recipe } from '../data/types';

export interface RecipeInput {
  id?: string;
  title: string;
  sourceUrl?: string;
  rawText: string;
  baseServings: number;
  yieldText?: string;
  ingredients: IngredientLine[];
}

/** Splits pasted text into lines and parses each one for the review table. Blank lines are dropped. */
export function draftLinesFromText(text: string, makeId: () => string): IngredientLine[] {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map((line) => parseIngredientLine(line, makeId()));
}

/** Re-parses one edited line, keeping its id. */
export function reparseLine(line: IngredientLine, raw: string): IngredientLine {
  return parseIngredientLine(raw, line.id);
}

export class RecipeValidationError extends Error {}

/** Creates or updates a recipe. Base servings is required and must be positive. */
export async function saveRecipe(
  db: CartCraftDb,
  input: RecipeInput,
  now: number,
  makeId: () => string,
): Promise<string> {
  const title = input.title.trim();
  if (!title) throw new RecipeValidationError('Title is required');
  if (!Number.isFinite(input.baseServings) || input.baseServings <= 0) {
    throw new RecipeValidationError('Base servings must be a positive number');
  }
  const existing = input.id ? await db.recipes.get(input.id) : undefined;
  const recipe: Recipe = {
    id: existing?.id ?? makeId(),
    title,
    rawText: input.rawText,
    baseServings: input.baseServings,
    ingredients: input.ingredients,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    ...(input.sourceUrl ? { sourceUrl: input.sourceUrl } : {}),
    ...(input.yieldText ? { yieldText: input.yieldText } : {}),
  };
  await db.recipes.put(recipe);
  return recipe.id;
}

export async function deleteRecipe(db: CartCraftDb, id: string): Promise<void> {
  await db.recipes.delete(id);
}

/**
 * Asks the browser to keep this site's storage (spec 6). Called after the first save; the
 * result is stored so Settings can show it. Safe to call when the API is missing.
 */
export async function requestPersistence(
  db: CartCraftDb,
  storage: Pick<StorageManager, 'persist' | 'persisted'> | undefined = globalThis.navigator?.storage,
): Promise<boolean | undefined> {
  if (!storage?.persist) return undefined;
  const granted = (await storage.persisted?.()) || (await storage.persist());
  await updateSettings(db, { persistGranted: granted });
  return granted;
}
```

- [ ] **Step 5: Implement `src/app/lists.ts`**

```ts
import {
  OTHER_AISLE, buildListItems, classifyAisle, parseIngredientLine, type Amount, type ListItem,
} from '../domain';
import type { CartCraftDb } from '../data/db';
import type { ShoppingList } from '../data/types';

export interface Selection {
  recipeId: string;
  targetServings: number;
}

export function defaultListName(now: number): string {
  const date = new Date(now).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `Shopping list, ${date}`;
}

async function loadClassifier(db: CartCraftDb): Promise<(itemKey: string) => string> {
  const overrides = new Map((await db.aisleOverrides.toArray()).map((o) => [o.itemKey, o.aisleId]));
  return (key) => classifyAisle(key, overrides);
}

/** Builds a new list snapshot from the selected recipes. Recipes edited later never change it. */
export async function createList(
  db: CartCraftDb,
  selections: Selection[],
  now: number,
  makeId: () => string,
): Promise<string> {
  const recipes = await db.recipes.bulkGet(selections.map((s) => s.recipeId));
  const chosen = selections.flatMap((s, i) => {
    const recipe = recipes[i];
    return recipe ? [{ recipe, targetServings: s.targetServings }] : [];
  });
  if (chosen.length === 0) throw new Error('No recipes selected');

  const pantryStaples = new Set((await db.pantryStaples.toArray()).map((p) => p.itemKey));
  const classify = await loadClassifier(db);
  const items = buildListItems(
    chosen.map(({ recipe, targetServings }) => ({
      title: recipe.title,
      baseServings: recipe.baseServings,
      targetServings,
      ingredients: recipe.ingredients,
    })),
    { pantryStaples, classify, makeId },
  );

  const list: ShoppingList = {
    id: makeId(),
    name: defaultListName(now),
    createdAt: now,
    sources: chosen.map(({ recipe, targetServings }) => ({ recipeId: recipe.id, title: recipe.title, targetServings })),
    items,
  };
  await db.lists.add(list);
  return list.id;
}

async function updateItems(
  db: CartCraftDb,
  listId: string,
  change: (items: ListItem[]) => ListItem[],
): Promise<void> {
  await db.transaction('rw', db.lists, async () => {
    const list = await db.lists.get(listId);
    if (!list) throw new Error(`List ${listId} not found`);
    await db.lists.update(listId, { items: change(list.items) });
  });
}

export async function setItemChecked(
  db: CartCraftDb,
  listId: string,
  itemId: string,
  checked: boolean,
  now: number,
): Promise<void> {
  await updateItems(db, listId, (items) =>
    items.map((item) => {
      if (item.id !== itemId) return item;
      if (checked) return { ...item, checked: true, checkedAt: now };
      const { checkedAt: _dropped, ...rest } = item;
      return { ...rest, checked: false };
    }),
  );
}

function itemFromText(text: string, id: string, classify: (key: string) => string): Omit<ListItem, 'checked' | 'origin' | 'fromRecipes'> {
  const line = parseIngredientLine(text, id);
  const amounts: Amount[] = line.quantity
    ? [{ quantity: line.quantity, ...(line.unit ? { unit: line.unit } : {}), ...(line.packageSize ? { packageSize: line.packageSize } : {}) }]
    : [];
  return {
    id,
    itemKey: line.itemKey,
    name: line.item || text.trim(),
    amounts,
    aisleId: line.itemKey ? classify(line.itemKey) : OTHER_AISLE,
    group: 'aisle',
    notes: line.notes,
  };
}

/** Adds a one-off item ("paper towels", "2 lb apples"), parsed and classified like recipe lines. */
export async function addAdhocItem(db: CartCraftDb, listId: string, text: string, makeId: () => string): Promise<string> {
  if (!text.trim()) throw new Error('Item text is required');
  const classify = await loadClassifier(db);
  const item: ListItem = { ...itemFromText(text, makeId(), classify), checked: false, origin: 'adhoc', fromRecipes: [] };
  await updateItems(db, listId, (items) => [...items, item]);
  return item.id;
}

/** Replaces an item's name, amount and notes from edited text. Aisle, check state and origin are kept. */
export async function editItem(db: CartCraftDb, listId: string, itemId: string, text: string): Promise<void> {
  if (!text.trim()) throw new Error('Item text is required');
  const classify = await loadClassifier(db);
  await updateItems(db, listId, (items) =>
    items.map((item) => {
      if (item.id !== itemId) return item;
      const parsed = itemFromText(text, item.id, classify);
      return { ...item, itemKey: parsed.itemKey, name: parsed.name, amounts: parsed.amounts, notes: parsed.notes };
    }),
  );
}

export async function deleteItem(db: CartCraftDb, listId: string, itemId: string): Promise<void> {
  await updateItems(db, listId, (items) => items.filter((item) => item.id !== itemId));
}

/** Moves an item and remembers the choice for that itemKey in future lists. */
export async function moveItemToAisle(db: CartCraftDb, listId: string, itemId: string, aisleId: string): Promise<void> {
  await db.transaction('rw', db.lists, db.aisleOverrides, async () => {
    const list = await db.lists.get(listId);
    const item = list?.items.find((i) => i.id === itemId);
    if (!list || !item) throw new Error(`Item ${itemId} not found`);
    await db.lists.update(listId, {
      items: list.items.map((i) => (i.id === itemId ? { ...i, aisleId, group: 'aisle' as const } : i)),
    });
    if (item.itemKey) await db.aisleOverrides.put({ itemKey: item.itemKey, aisleId, source: 'user' });
  });
}

export async function renameList(db: CartCraftDb, listId: string, name: string): Promise<void> {
  if (!name.trim()) throw new Error('Name is required');
  await db.lists.update(listId, { name: name.trim() });
}

export async function deleteList(db: CartCraftDb, listId: string): Promise<void> {
  await db.lists.delete(listId);
}
```

- [ ] **Step 6: Run tests and typecheck**

Run: `npx vitest run src/app && npm run typecheck`
Expected: PASS; `tsc` prints nothing.

- [ ] **Step 7: Commit**

```bash
git add src/app
git commit -m "feat(app): save recipes and build editable list snapshots"
```

---

### Task 3: List view grouping and settings use cases

**Files:**
- Create: `src/app/listView.ts`, `src/app/settings.ts`
- Test: `src/app/listView.test.ts`, `src/app/settings.test.ts`

**Interfaces:**
- Consumes: `OTHER_AISLE`, `formatAmounts`, `itemKey`, `ListItem`, `UnitSystem` from `src/domain`; `Aisle` from `src/data/types`; `CartCraftDb`.
- Produces: `ListSection { id; title; items }`, `ListView { aisles: ListSection[]; pantry: ListItem[]; inCart: ListItem[] }`, `groupListItems(items, aisles): ListView`, `itemLabel(item, system): string` (e.g. "Milk: 1 1/2 cups"), `listAsText(name, items, aisles, system): string`; `addPantryStaple(db, text): Promise<string | undefined>`, `removePantryStaple(db, key)`, `renameAisle(db, id, name)`, `moveAisle(db, id, 'up' | 'down')`.

- [ ] **Step 1: Write the failing tests**

`src/app/listView.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { ListItem } from '../domain';
import type { Aisle } from '../data/types';
import { groupListItems, itemLabel, listAsText } from './listView';

const aisles: Aisle[] = [
  { id: 'dairy-eggs', name: 'Dairy & Eggs', order: 1 },
  { id: 'produce', name: 'Produce', order: 0 },
  { id: 'other', name: 'Other', order: 2 },
];

function item(id: string, name: string, patch: Partial<ListItem> = {}): ListItem {
  return {
    id, itemKey: name, name, amounts: [], aisleId: 'produce', group: 'aisle', checked: false,
    origin: 'recipe', fromRecipes: [], notes: '', ...patch,
  };
}

describe('groupListItems', () => {
  it('orders sections by aisle order, sorts items by name and drops empty aisles', () => {
    const view = groupListItems(
      [item('1', 'onion'), item('2', 'egg', { aisleId: 'dairy-eggs' }), item('3', 'apple')],
      aisles,
    );
    expect(view.aisles.map((s) => [s.title, s.items.map((i) => i.name)])).toEqual([
      ['Produce', ['apple', 'onion']],
      ['Dairy & Eggs', ['egg']],
    ]);
  });

  it('puts pantry items and checked items in their own groups', () => {
    const view = groupListItems(
      [
        item('1', 'salt', { group: 'pantry' }),
        item('2', 'onion', { checked: true, checkedAt: 10 }),
        item('3', 'apple', { checked: true, checkedAt: 20 }),
      ],
      aisles,
    );
    expect(view.aisles).toEqual([]);
    expect(view.pantry.map((i) => i.name)).toEqual(['salt']);
    expect(view.inCart.map((i) => i.name)).toEqual(['apple', 'onion']);
  });

  it('sends items with an unknown aisle to Other', () => {
    const view = groupListItems([item('1', 'thing', { aisleId: 'deleted-aisle' })], aisles);
    expect(view.aisles.map((s) => s.id)).toEqual(['other']);
  });
});

describe('itemLabel and listAsText', () => {
  it('capitalizes and appends formatted amounts', () => {
    expect(itemLabel(item('1', 'milk', { amounts: [{ quantity: { min: 354.882 }, unit: 'ml' }] }), 'us')).toBe('Milk: 1 1/2 cups');
    expect(itemLabel(item('2', 'paper towels'), 'us')).toBe('Paper towels');
  });

  it('renders unchecked items grouped by aisle, then pantry', () => {
    const text = listAsText(
      'Weekend',
      [
        item('1', 'onion', { amounts: [{ quantity: { min: 2 } }] }),
        item('2', 'egg', { aisleId: 'dairy-eggs', amounts: [{ quantity: { min: 6 } }] }),
        item('3', 'salt', { group: 'pantry' }),
        item('4', 'apple', { checked: true }),
      ],
      aisles,
      'us',
    );
    expect(text).toBe('Weekend\n\nProduce\n- Onion: 2\n\nDairy & Eggs\n- Egg: 6\n\nCheck pantry\n- Salt');
  });
});
```

`src/app/settings.test.ts`:

```ts
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
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/app/listView.test.ts src/app/settings.test.ts`
Expected: FAIL, imports `./listView` and `./settings` cannot be resolved.

- [ ] **Step 3: Implement `src/app/listView.ts`**

```ts
import { OTHER_AISLE, formatAmounts, type ListItem, type UnitSystem } from '../domain';
import type { Aisle } from '../data/types';

export interface ListSection {
  id: string;
  title: string;
  items: ListItem[];
}

export interface ListView {
  /** Unchecked aisle items, in the user's aisle order. Empty aisles are omitted. */
  aisles: ListSection[];
  /** Unchecked pantry staples ("Check pantry"). */
  pantry: ListItem[];
  /** Checked items, most recently checked first. */
  inCart: ListItem[];
}

const byName = (a: ListItem, b: ListItem) => a.name.localeCompare(b.name);

/** Groups list items for shopping mode. Items with an unknown aisle id fall into Other. */
export function groupListItems(items: ListItem[], aisles: Aisle[]): ListView {
  const ordered = [...aisles].sort((a, b) => a.order - b.order);
  const known = new Set(ordered.map((a) => a.id));
  const unchecked = items.filter((i) => !i.checked);

  const sections = ordered
    .map((aisle): ListSection => ({
      id: aisle.id,
      title: aisle.name,
      items: unchecked
        .filter((i) => i.group === 'aisle' && (known.has(i.aisleId) ? i.aisleId : OTHER_AISLE) === aisle.id)
        .sort(byName),
    }))
    .filter((s) => s.items.length > 0);

  return {
    aisles: sections,
    pantry: unchecked.filter((i) => i.group === 'pantry').sort(byName),
    inCart: items.filter((i) => i.checked).sort((a, b) => (b.checkedAt ?? 0) - (a.checkedAt ?? 0)),
  };
}

export function itemLabel(item: ListItem, system: UnitSystem): string {
  const amount = formatAmounts(item.amounts, system);
  const name = item.name.charAt(0).toUpperCase() + item.name.slice(1);
  return amount ? `${name}: ${amount}` : name;
}

/** Plain text for "Copy list": unchecked items only, grouped by aisle, then pantry. */
export function listAsText(name: string, items: ListItem[], aisles: Aisle[], system: UnitSystem): string {
  const view = groupListItems(items, aisles);
  const blocks = [name];
  for (const section of view.aisles) {
    blocks.push([section.title, ...section.items.map((i) => `- ${itemLabel(i, system)}`)].join('\n'));
  }
  if (view.pantry.length > 0) {
    blocks.push(['Check pantry', ...view.pantry.map((i) => `- ${itemLabel(i, system)}`)].join('\n'));
  }
  return blocks.join('\n\n');
}
```

- [ ] **Step 4: Implement `src/app/settings.ts`**

```ts
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
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run src/app && npm run typecheck`
Expected: PASS; `tsc` prints nothing.

- [ ] **Step 6: Commit**

```bash
git add src/app/listView.ts src/app/listView.test.ts src/app/settings.ts src/app/settings.test.ts
git commit -m "feat(app): group lists for shopping and manage pantry and aisles"
```

---

### Task 4: Backup export, import and undo

**Files:**
- Create: `src/data/backupSchema.ts`, `src/data/backup.ts`
- Test: `src/data/backup.test.ts`

**Interfaces:**
- Consumes: record types; `CartCraftDb`; `createList`, `draftLinesFromText`, `saveRecipe` (tests only).
- Produces: `BackupDataSchema`; `BACKUP_FORMAT`, `BACKUP_SCHEMA_VERSION`, `MAX_BACKUP_BYTES`, `BackupFile`, `ParseResult` (`{ ok: true; backup } | { ok: false; error: 'too_large' | 'not_json' | 'wrong_format' | 'newer_version' | 'invalid'; detail? }`), `stripSecrets(value)`, `readBackupData(db)`, `exportBackup(db, now)`, `serializeBackup(file)`, `backupFileName(now)`, `parseBackup(text)`, `BackupSummary`, `summarizeBackup(data)`, `importBackup(db, backup, now)`, `hasUndoSnapshot(db)`, `undoLastImport(db): Promise<boolean>`.

- [ ] **Step 1: Write the failing test `src/data/backup.test.ts`**

```ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/data/backup.test.ts`
Expected: FAIL, import `./backup` cannot be resolved.

- [ ] **Step 3: Implement `src/data/backupSchema.ts`**

```ts
import { z } from 'zod';
import type { Amount, IngredientLine, ListItem, Quantity } from '../domain';
import type { Aisle, AisleOverride, BackupData, PantryStaple, Recipe, Settings, ShoppingList } from './types';

const text = (max = 2000) => z.string().max(max);
const id = text(200);
const count = z.number().finite().nonnegative();

const QuantitySchema: z.ZodType<Quantity> = z.object({ min: count, max: count.optional() });
const PackageSizeSchema = z.object({ quantity: count, unit: id });

const IngredientLineSchema: z.ZodType<IngredientLine> = z.object({
  id,
  raw: text(),
  quantity: QuantitySchema.optional(),
  unit: id.optional(),
  item: text(),
  itemKey: text(),
  size: z.enum(['small', 'medium', 'large']).optional(),
  packageSize: PackageSizeSchema.optional(),
  notes: text(),
  alternatives: z.array(text()).max(20),
  scalable: z.boolean(),
  approximate: z.boolean(),
  isHeader: z.boolean(),
  needsReview: z.boolean(),
});

const AmountSchema: z.ZodType<Amount> = z.object({
  quantity: QuantitySchema,
  unit: id.optional(),
  packageSize: PackageSizeSchema.optional(),
});

const ListItemSchema: z.ZodType<ListItem> = z.object({
  id,
  itemKey: text(),
  name: text(),
  amounts: z.array(AmountSchema).max(50),
  aisleId: id,
  group: z.enum(['aisle', 'pantry']),
  checked: z.boolean(),
  checkedAt: count.optional(),
  origin: z.enum(['recipe', 'adhoc']),
  fromRecipes: z.array(text(500)).max(100),
  notes: text(),
});

const RecipeSchema: z.ZodType<Recipe> = z.object({
  id,
  title: text(500),
  sourceUrl: text().optional(),
  rawText: text(100_000),
  baseServings: z.number().finite().positive(),
  yieldText: text(500).optional(),
  ingredients: z.array(IngredientLineSchema).max(500),
  createdAt: count,
  updatedAt: count,
});

const ShoppingListSchema: z.ZodType<ShoppingList> = z.object({
  id,
  name: text(500),
  createdAt: count,
  sources: z.array(z.object({ recipeId: id, title: text(500), targetServings: z.number().finite().positive() })).max(100),
  items: z.array(ListItemSchema).max(2000),
  extras: z
    .object({
      swaps: z.array(z.object({ item: text(500), swap: text() })).max(100),
      tips: z.array(text()).max(100),
      generatedAt: count,
    })
    .optional(),
});

const PantryStapleSchema: z.ZodType<PantryStaple> = z.object({ itemKey: text(200) });
const AisleSchema: z.ZodType<Aisle> = z.object({ id, name: text(200), order: z.number().int() });
const AisleOverrideSchema: z.ZodType<AisleOverride> = z.object({
  itemKey: text(200),
  aisleId: id,
  source: z.enum(['user', 'llm']),
});

/** Unknown keys (including any smuggled-in API key fields) are stripped by z.object. */
const SettingsSchema: z.ZodType<Settings> = z.object({
  id: z.literal('settings'),
  unitSystem: z.enum(['us', 'metric']),
  defaultServings: z.number().finite().positive(),
  llm: z.object({ providerId: id, model: text(200) }),
  keepScreenOn: z.boolean(),
  persistGranted: z.boolean().optional(),
});

export const BackupDataSchema: z.ZodType<BackupData> = z.object({
  recipes: z.array(RecipeSchema).max(5000),
  lists: z.array(ShoppingListSchema).max(5000),
  pantryStaples: z.array(PantryStapleSchema).max(5000),
  aisles: z.array(AisleSchema).max(200),
  aisleOverrides: z.array(AisleOverrideSchema).max(20_000),
  settings: z.array(SettingsSchema).max(1),
});
```

- [ ] **Step 4: Implement `src/data/backup.ts`**

```ts
import { BackupDataSchema } from './backupSchema';
import type { CartCraftDb } from './db';
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
  return {
    ok: true,
    backup: {
      format: BACKUP_FORMAT,
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: typeof envelope.exportedAt === 'number' ? envelope.exportedAt : 0,
      data: parsed.data,
    },
  };
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
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run src/data && npm run typecheck`
Expected: PASS; `tsc` prints nothing.

- [ ] **Step 6: Commit**

```bash
git add src/data/backupSchema.ts src/data/backup.ts src/data/backup.test.ts
git commit -m "feat(data): versioned backup export, validated import with snapshot and undo"
```

---

### Task 5: UI foundations and shared components

**Files:**
- Create: `src/ui/db.tsx`, `src/ui/hooks.ts`, `src/test/render.tsx`, `src/ui/components/ServingsStepper.tsx`, `src/ui/components/ReviewTable.tsx`
- Test: `src/ui/components/components.test.tsx`

**Interfaces:**
- Consumes: `CartCraftDb`, `DEFAULT_SETTINGS`; `Aisle`, `Settings`; `formatAmount`, `parseIngredientLine`, `IngredientLine`, `UnitSystem`; `reparseLine`, `draftLinesFromText`.
- Produces: `DbProvider({ db, children })`, `useDb()`; `useSettings(): Settings`, `useAisles(): Aisle[] | undefined`; `renderRoutes(routes: { path; element }[], url, db?)` returning Testing Library result plus `{ db, user }` and a `data-testid="location"` element holding the current path; `ServingsStepper({ value, onChange, label, min?, max? })` with buttons labelled "Fewer servings for {label}" and "More servings for {label}"; `ReviewTable({ lines, onChange, unitSystem, makeId })` with inputs labelled "Ingredient line N", remove buttons "Remove line N", an "Add line" button, a `data-testid="parsed"` summary per line, and an icon labelled "Check this line" on flagged lines.

- [ ] **Step 1: Create `src/ui/db.tsx`**

```tsx
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
```

- [ ] **Step 2: Create `src/ui/hooks.ts`**

```ts
import { useLiveQuery } from 'dexie-react-hooks';
import { DEFAULT_SETTINGS } from '../data/db';
import type { Aisle, Settings } from '../data/types';
import { useDb } from './db';

/** Live settings; falls back to defaults while loading. */
export function useSettings(): Settings {
  const db = useDb();
  return useLiveQuery(() => db.settings.get('settings'), [db]) ?? DEFAULT_SETTINGS;
}

/** Live aisles in shopping order; undefined while loading. */
export function useAisles(): Aisle[] | undefined {
  const db = useDb();
  return useLiveQuery(() => db.aisles.orderBy('order').toArray(), [db]);
}
```

- [ ] **Step 3: Create `src/test/render.tsx`**

```tsx
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
```

- [ ] **Step 4: Write the failing test `src/ui/components/components.test.tsx`**

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { IngredientLine } from '../../domain';
import { draftLinesFromText } from '../../app/recipes';
import { sequentialIds } from '../../test/db';
import { ReviewTable } from './ReviewTable';
import { ServingsStepper } from './ServingsStepper';

describe('ServingsStepper', () => {
  it('steps within bounds', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ServingsStepper value={1} onChange={onChange} label="Tacos" />);
    expect(screen.getByRole('button', { name: 'Fewer servings for Tacos' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'More servings for Tacos' }));
    expect(onChange).toHaveBeenCalledWith(2);
  });
});

function Harness({ initial }: { initial: IngredientLine[] }) {
  const [lines, setLines] = useState(initial);
  return <ReviewTable lines={lines} onChange={setLines} unitSystem="us" makeId={sequentialIds('new')} />;
}

describe('ReviewTable', () => {
  const initial = () => draftLinesFromText('2 cups flour\nsalt and pepper to taste', sequentialIds('line'));

  it('shows the parsed result and highlights lines that need review', () => {
    render(<Harness initial={initial()} />);
    const parsed = screen.getAllByTestId('parsed');
    expect(parsed[0]).toHaveTextContent('2 cups · flour');
    expect(parsed[1]).toHaveTextContent('no amount · salt and pepper (to taste)');
    expect(screen.getAllByLabelText('Check this line')).toHaveLength(1);
  });

  it('re-parses a line when it is edited', async () => {
    const user = userEvent.setup();
    render(<Harness initial={initial()} />);
    const input = screen.getByLabelText('Ingredient line 1');
    await user.clear(input);
    await user.type(input, '3 tbsp sugar');
    await user.tab();
    expect(screen.getAllByTestId('parsed')[0]).toHaveTextContent('3 tbsp · sugar');
  });

  it('removes and adds lines', async () => {
    const user = userEvent.setup();
    render(<Harness initial={initial()} />);
    await user.click(screen.getByLabelText('Remove line 2'));
    expect(screen.getAllByTestId('parsed')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: /add line/i }));
    expect(screen.getAllByTestId('parsed')).toHaveLength(2);
  });
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `npx vitest run src/ui/components`
Expected: FAIL, imports `./ReviewTable` and `./ServingsStepper` cannot be resolved.

- [ ] **Step 6: Implement `src/ui/components/ServingsStepper.tsx`**

```tsx
import { Minus, Plus } from 'lucide-react';

interface Props {
  value: number;
  onChange: (value: number) => void;
  label: string;
  min?: number;
  max?: number;
}

export function ServingsStepper({ value, onChange, label, min = 1, max = 99 }: Props) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-1 py-1" role="group" aria-label={label}>
      <button
        type="button"
        className="rounded-full p-2 hover:bg-white disabled:opacity-40"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label={`Fewer servings for ${label}`}
      >
        <Minus size={14} />
      </button>
      <span className="w-8 text-center text-sm font-semibold" aria-live="polite">{value}</span>
      <button
        type="button"
        className="rounded-full p-2 hover:bg-white disabled:opacity-40"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label={`More servings for ${label}`}
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
```

- [ ] **Step 7: Implement `src/ui/components/ReviewTable.tsx`**

```tsx
import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { formatAmount, parseIngredientLine, type IngredientLine, type UnitSystem } from '../../domain';
import { reparseLine } from '../../app/recipes';

interface Props {
  lines: IngredientLine[];
  onChange: (lines: IngredientLine[]) => void;
  unitSystem: UnitSystem;
  makeId: () => string;
}

function parsedSummary(line: IngredientLine, system: UnitSystem): string {
  if (line.isHeader) return 'Section heading';
  const amount = line.quantity
    ? formatAmount({ quantity: line.quantity, ...(line.unit ? { unit: line.unit } : {}), ...(line.packageSize ? { packageSize: line.packageSize } : {}) }, system)
    : 'no amount';
  const notes = line.notes ? ` (${line.notes})` : '';
  return `${amount} · ${line.item || '?'}${notes}`;
}

function LineRow({ line, index, system, onEdit, onRemove }: {
  line: IngredientLine;
  index: number;
  system: UnitSystem;
  onEdit: (raw: string) => void;
  onRemove: () => void;
}) {
  const [draft, setDraft] = useState(line.raw);
  const flagged = line.needsReview && !line.isHeader;
  return (
    <li className={`rounded-lg border p-3 ${flagged ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-center gap-2">
        <input
          className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1 font-mono text-sm"
          value={draft}
          aria-label={`Ingredient line ${index + 1}`}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => draft !== line.raw && onEdit(draft)}
        />
        <button type="button" onClick={onRemove} className="p-2 text-slate-400 hover:text-red-600" aria-label={`Remove line ${index + 1}`}>
          <Trash2 size={16} />
        </button>
      </div>
      <p className="mt-1 flex items-center gap-1 text-xs text-slate-500" data-testid="parsed">
        {flagged && <AlertTriangle size={12} className="text-amber-600" aria-label="Check this line" />}
        {parsedSummary(line, system)}
      </p>
    </li>
  );
}

/** Editable review of parsed lines. Flagged lines are highlighted; editing a line re-parses it. */
export function ReviewTable({ lines, onChange, unitSystem, makeId }: Props) {
  return (
    <div>
      <ul className="space-y-2">
        {lines.map((line, index) => (
          <LineRow
            key={line.id}
            line={line}
            index={index}
            system={unitSystem}
            onEdit={(raw) => onChange(lines.map((l) => (l.id === line.id ? reparseLine(l, raw) : l)))}
            onRemove={() => onChange(lines.filter((l) => l.id !== line.id))}
          />
        ))}
      </ul>
      <button
        type="button"
        className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-emerald-800"
        onClick={() => onChange([...lines, parseIngredientLine('', makeId())])}
      >
        <Plus size={16} /> Add line
      </button>
    </div>
  );
}
```

- [ ] **Step 8: Run tests and typecheck**

Run: `npx vitest run src/ui && npm run typecheck`
Expected: PASS; `tsc` prints nothing.

- [ ] **Step 9: Commit**

```bash
git add src/ui src/test/render.tsx
git commit -m "feat(ui): add db context, hooks, servings stepper and review table"
```

---

### Task 6: Add and edit recipe screen

**Files:**
- Create: `src/ui/screens/RecipeEditorScreen.tsx`
- Test: `src/ui/screens/RecipeEditorScreen.test.tsx`

**Interfaces:**
- Consumes: `newId`; `deleteRecipe`, `draftLinesFromText`, `requestPersistence`, `saveRecipe`; `ReviewTable`; `useDb`, `useSettings`.
- Produces: `RecipeEditorScreen({ makeId?, now? })`, mounted at `/recipes/new` and `/recipes/:id`. Labels: "Ingredients", "Title", "Base servings"; buttons "Parse ingredients" (then "Parse again"), "Save recipe", "Delete" (edit only). Saving navigates to `/`. The first saved recipe triggers `requestPersistence`.

- [ ] **Step 1: Write the failing test `src/ui/screens/RecipeEditorScreen.test.tsx`**

```tsx
// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { draftLinesFromText, saveRecipe } from '../../app/recipes';
import { createTestDb, sequentialIds } from '../../test/db';
import { renderRoutes } from '../../test/render';
import { RecipeEditorScreen } from './RecipeEditorScreen';

const routes = (makeId = sequentialIds('id')) => [
  { path: '/recipes/new', element: <RecipeEditorScreen makeId={makeId} now={() => 1000} /> },
  { path: '/recipes/:id', element: <RecipeEditorScreen makeId={makeId} now={() => 2000} /> },
];

describe('RecipeEditorScreen', () => {
  it('parses pasted text, prefills servings, and saves after review', async () => {
    const { user, db } = renderRoutes(routes(), '/recipes/new');
    await user.type(screen.getByLabelText('Ingredients'), '2 cups flour{enter}3 eggs');
    await user.click(screen.getByRole('button', { name: 'Parse ingredients' }));

    expect(screen.getByText('Review (2 lines)')).toBeInTheDocument();
    expect(screen.getByLabelText('Base servings')).toHaveValue(4);
    const save = screen.getByRole('button', { name: 'Save recipe' });
    expect(save).toBeDisabled();

    await user.type(screen.getByLabelText('Title'), 'Pancakes');
    await user.click(save);

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/'));
    const [recipe] = await db.recipes.toArray();
    expect(recipe).toMatchObject({ title: 'Pancakes', baseServings: 4, rawText: '2 cups flour\n3 eggs', createdAt: 1000 });
    expect(recipe?.ingredients.map((l) => l.itemKey)).toEqual(['flour', 'egg']);
  });

  it('does not save without base servings', async () => {
    const { user } = renderRoutes(routes(), '/recipes/new');
    await user.type(screen.getByLabelText('Ingredients'), '1 egg');
    await user.click(screen.getByRole('button', { name: 'Parse ingredients' }));
    await user.type(screen.getByLabelText('Title'), 'Egg');
    await user.clear(screen.getByLabelText('Base servings'));
    expect(screen.getByRole('button', { name: 'Save recipe' })).toBeDisabled();
  });

  it('loads an existing recipe for editing and deletes it', async () => {
    const db = createTestDb();
    const ids = sequentialIds('r');
    const id = await saveRecipe(db, { title: 'Soup', rawText: '1 onion', baseServings: 2, ingredients: draftLinesFromText('1 onion', ids) }, 1, ids);
    const { user } = renderRoutes(routes(), `/recipes/${id}`, db);

    expect(await screen.findByDisplayValue('Soup')).toBeInTheDocument();
    expect(screen.getByLabelText('Base servings')).toHaveValue(2);

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/'));
    expect(await db.recipes.count()).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/ui/screens/RecipeEditorScreen.test.tsx`
Expected: FAIL, import `./RecipeEditorScreen` cannot be resolved.

- [ ] **Step 3: Implement `src/ui/screens/RecipeEditorScreen.tsx`**

```tsx
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import type { IngredientLine } from '../../domain';
import { newId } from '../../app/ids';
import { deleteRecipe, draftLinesFromText, requestPersistence, saveRecipe } from '../../app/recipes';
import { ReviewTable } from '../components/ReviewTable';
import { useDb } from '../db';
import { useSettings } from '../hooks';

interface Props {
  makeId?: () => string;
  now?: () => number;
}

/** Add (/recipes/new) or edit (/recipes/:id). Paste text, review parsed lines, set servings, save. */
export function RecipeEditorScreen({ makeId = newId, now = Date.now }: Props) {
  const { id } = useParams();
  const db = useDb();
  const navigate = useNavigate();
  const settings = useSettings();

  const [loaded, setLoaded] = useState(id === undefined);
  const [rawText, setRawText] = useState('');
  const [title, setTitle] = useState('');
  const [servings, setServings] = useState<string>('');
  const [lines, setLines] = useState<IngredientLine[] | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | undefined>();
  const [yieldText, setYieldText] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id === undefined) return;
    void db.recipes.get(id).then((recipe) => {
      if (recipe) {
        setTitle(recipe.title);
        setRawText(recipe.rawText);
        setServings(String(recipe.baseServings));
        setLines(recipe.ingredients);
        setSourceUrl(recipe.sourceUrl);
        setYieldText(recipe.yieldText);
      }
      setLoaded(true);
    });
  }, [db, id]);

  const parse = () => {
    setLines(draftLinesFromText(rawText, makeId));
    if (!servings) setServings(String(settings.defaultServings));
  };

  const baseServings = Number(servings);
  const canSave = lines !== null && title.trim() !== '' && Number.isFinite(baseServings) && baseServings > 0;

  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSave || !lines) return;
    setError(null);
    try {
      const isFirst = (await db.recipes.count()) === 0;
      await saveRecipe(
        db,
        {
          ...(id ? { id } : {}),
          title,
          rawText,
          baseServings,
          ingredients: lines.filter((l) => l.raw.trim() !== ''),
          ...(sourceUrl ? { sourceUrl } : {}),
          ...(yieldText ? { yieldText } : {}),
        },
        now(),
        makeId,
      );
      if (isFirst) void requestPersistence(db);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the recipe');
    }
  };

  const onDelete = async () => {
    if (!id || !window.confirm(`Delete "${title}"?`)) return;
    await deleteRecipe(db, id);
    navigate('/');
  };

  if (!loaded) return null;

  return (
    <form onSubmit={onSave} className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">{id ? 'Edit recipe' : 'Add recipe'}</h1>

      <section className="space-y-2">
        <label htmlFor="raw" className="block text-sm font-medium text-slate-700">Ingredients</label>
        <textarea
          id="raw"
          className="h-40 w-full rounded-xl border border-slate-200 p-3 font-mono text-sm"
          placeholder={'2 cups flour\n3 eggs\nSalt, to taste'}
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
        />
        <button
          type="button"
          onClick={parse}
          disabled={!rawText.trim()}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {lines ? 'Parse again' : 'Parse ingredients'}
        </button>
      </section>

      {lines && (
        <>
          <section className="grid gap-4 sm:grid-cols-[1fr_10rem]">
            <label className="block text-sm font-medium text-slate-700">
              Title
              <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Base servings
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                type="number"
                min={1}
                inputMode="numeric"
                value={servings}
                onChange={(e) => setServings(e.target.value)}
              />
            </label>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-medium text-slate-700">Review ({lines.length} lines)</h2>
            <ReviewTable lines={lines} onChange={setLines} unitSystem={settings.unitSystem} makeId={makeId} />
          </section>

          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}

          <div className="flex items-center gap-3">
            <button type="submit" disabled={!canSave} className="rounded-lg bg-emerald-800 px-5 py-2.5 font-medium text-white disabled:opacity-40">
              Save recipe
            </button>
            {id && (
              <button type="button" onClick={() => void onDelete()} className="text-sm font-medium text-red-700">
                Delete
              </button>
            )}
          </div>
        </>
      )}
    </form>
  );
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run src/ui/screens/RecipeEditorScreen.test.tsx && npm run typecheck`
Expected: PASS; `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens/RecipeEditorScreen.tsx src/ui/screens/RecipeEditorScreen.test.tsx
git commit -m "feat(ui): add and edit recipes with a review step"
```

---

### Task 7: Recipes screen

**Files:**
- Create: `src/ui/screens/RecipesScreen.tsx`
- Test: `src/ui/screens/RecipesScreen.test.tsx`

**Interfaces:**
- Consumes: `newId`; `createList`; `ServingsStepper`; `useDb`, `useSettings`.
- Produces: `RecipesScreen({ makeId?, now? })` mounted at `/`. Controls: "Search recipes" input, "Add recipe" link, "Select {title}" toggle buttons, per-recipe servings stepper prefilled from default servings, "Edit {title}" links, "Build list (N)" button that navigates to `/lists/{id}`.

- [ ] **Step 1: Write the failing test `src/ui/screens/RecipesScreen.test.tsx`**

```tsx
// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { formatAmounts } from '../../domain';
import { draftLinesFromText, saveRecipe } from '../../app/recipes';
import type { CartCraftDb } from '../../data/db';
import { createTestDb, sequentialIds } from '../../test/db';
import { renderRoutes } from '../../test/render';
import { RecipesScreen } from './RecipesScreen';

async function addRecipe(db: CartCraftDb, title: string, text: string, baseServings = 4) {
  const ids = sequentialIds(title);
  return saveRecipe(db, { title, rawText: text, baseServings, ingredients: draftLinesFromText(text, ids) }, 1, ids);
}

const routes = [{ path: '/', element: <RecipesScreen makeId={sequentialIds('new')} now={() => 5} /> }];

describe('RecipesScreen', () => {
  it('shows an empty state', async () => {
    renderRoutes(routes, '/');
    expect(await screen.findByText(/No recipes yet/)).toBeInTheDocument();
  });

  it('filters by search', async () => {
    const db = createTestDb();
    await addRecipe(db, 'Tacos', '1 onion');
    await addRecipe(db, 'Soup', '2 carrots');
    const { user } = renderRoutes(routes, '/', db);
    await screen.findByText('Tacos');
    await user.type(screen.getByLabelText('Search recipes'), 'so');
    expect(screen.queryByText('Tacos')).not.toBeInTheDocument();
    expect(screen.getByText('Soup')).toBeInTheDocument();
  });

  it('builds a list from selected recipes with per-recipe servings', async () => {
    const db = createTestDb();
    await addRecipe(db, 'Tacos', '1 cup milk');
    await addRecipe(db, 'Soup', '2 carrots', 2);
    const { user } = renderRoutes(routes, '/', db);

    await user.click(await screen.findByRole('button', { name: 'Select Tacos' }));
    await user.click(screen.getByRole('button', { name: 'More servings for Tacos' }));
    await user.click(screen.getByRole('button', { name: 'More servings for Tacos' }));
    await user.click(screen.getByRole('button', { name: 'Select Soup' }));
    await user.click(screen.getByRole('button', { name: 'Build list (2)' }));

    await waitFor(() => expect(screen.getByTestId('location').textContent).toMatch(/^\/lists\//));
    const [list] = await db.lists.toArray();
    expect(list?.sources.map((s) => [s.title, s.targetServings])).toEqual([['Tacos', 6], ['Soup', 4]]);
    const byKey = Object.fromEntries(list!.items.map((i) => [i.itemKey, formatAmounts(i.amounts, 'us')]));
    expect(byKey).toEqual({ milk: '1 1/2 cups', carrot: '4' });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/ui/screens/RecipesScreen.test.tsx`
Expected: FAIL, import `./RecipesScreen` cannot be resolved.

- [ ] **Step 3: Implement `src/ui/screens/RecipesScreen.tsx`**

```tsx
import { useLiveQuery } from 'dexie-react-hooks';
import { CheckCircle2, Circle, Plus, ShoppingCart } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { newId } from '../../app/ids';
import { createList } from '../../app/lists';
import { ServingsStepper } from '../components/ServingsStepper';
import { useDb } from '../db';
import { useSettings } from '../hooks';

interface Props {
  makeId?: () => string;
  now?: () => number;
}

/** Search recipes, select some with per-recipe target servings, and build a list. */
export function RecipesScreen({ makeId = newId, now = Date.now }: Props) {
  const db = useDb();
  const navigate = useNavigate();
  const settings = useSettings();
  const recipes = useLiveQuery(() => db.recipes.orderBy('title').toArray(), [db]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Map<string, number>>(new Map());
  const [building, setBuilding] = useState(false);

  if (!recipes) return null;

  const visible = recipes.filter((r) => r.title.toLowerCase().includes(query.trim().toLowerCase()));

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else next.set(id, settings.defaultServings);
      return next;
    });
  };

  const setServings = (id: string, servings: number) => {
    setSelected((prev) => new Map(prev).set(id, servings));
  };

  const build = async () => {
    setBuilding(true);
    try {
      const listId = await createList(
        db,
        [...selected].map(([recipeId, targetServings]) => ({ recipeId, targetServings })),
        now(),
        makeId,
      );
      navigate(`/lists/${listId}`);
    } finally {
      setBuilding(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-28">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Recipes</h1>
        <Link to="/recipes/new" className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white">
          <Plus size={16} /> Add recipe
        </Link>
      </div>

      {recipes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
          No recipes yet. Add one to start building shopping lists.
        </p>
      ) : (
        <>
          <input
            type="search"
            className="w-full rounded-lg border border-slate-200 px-3 py-2"
            placeholder="Search recipes"
            aria-label="Search recipes"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <ul className="space-y-2">
            {visible.map((recipe) => {
              const isSelected = selected.has(recipe.id);
              return (
                <li key={recipe.id} className={`rounded-xl border p-3 ${isSelected ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => toggle(recipe.id)}
                      aria-pressed={isSelected}
                      aria-label={`Select ${recipe.title}`}
                      className="shrink-0"
                    >
                      {isSelected ? <CheckCircle2 className="text-emerald-700" /> : <Circle className="text-slate-300" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-900">{recipe.title}</p>
                      <p className="text-xs text-slate-500">
                        {recipe.ingredients.length} ingredients · serves {recipe.baseServings}
                      </p>
                    </div>
                    <Link to={`/recipes/${recipe.id}`} className="text-sm font-medium text-slate-600" aria-label={`Edit ${recipe.title}`}>
                      Edit
                    </Link>
                  </div>
                  {isSelected && (
                    <div className="mt-2 flex items-center gap-2 pl-9 text-sm text-slate-600">
                      Make for
                      <ServingsStepper
                        value={selected.get(recipe.id) ?? settings.defaultServings}
                        onChange={(n) => setServings(recipe.id, n)}
                        label={recipe.title}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-20 flex justify-center px-4 md:bottom-6">
          <button
            type="button"
            onClick={() => void build()}
            disabled={building}
            className="inline-flex items-center gap-2 rounded-full bg-emerald-800 px-6 py-3 font-medium text-white shadow-lg disabled:opacity-50"
          >
            <ShoppingCart size={18} /> Build list ({selected.size})
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run src/ui/screens/RecipesScreen.test.tsx && npm run typecheck`
Expected: PASS; `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens/RecipesScreen.tsx src/ui/screens/RecipesScreen.test.tsx
git commit -m "feat(ui): select recipes with per-recipe servings and build a list"
```

---

### Task 8: Lists history and shopping mode

**Files:**
- Create: `src/ui/components/ListItemRow.tsx`, `src/ui/screens/ListsScreen.tsx`, `src/ui/screens/ListScreen.tsx`
- Test: `src/ui/screens/ListScreens.test.tsx`

**Interfaces:**
- Consumes: `formatAmounts`, `ListItem`, `UnitSystem`; `itemLabel`, `groupListItems`, `listAsText`; `addAdhocItem`, `deleteItem`, `deleteList`, `editItem`, `moveItemToAisle`, `renameList`, `setItemChecked`; `newId`; `useDb`, `useAisles`, `useSettings`.
- Produces: `ListsScreen()` at `/lists` (delete buttons "Delete {name}"); `ListScreen({ makeId?, now?, undoMs? })` at `/lists/:id` with aisle sections as regions named by aisle, a "Check pantry" region, an "In cart (N)" disclosure, row buttons named by `itemLabel` (e.g. "Onions: 2"), "Options for {name}" menus with "Edit {name}" input, "Aisle for {name}" select and "Delete", an "Add an item" input with an "Add item" button, "Rename list" and "Copy list as text" buttons, and an "Undo" toast after checking; `ListItemRow(props)`.

- [ ] **Step 1: Write the failing test `src/ui/screens/ListScreens.test.tsx`**

```tsx
// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createList } from '../../app/lists';
import { draftLinesFromText, saveRecipe } from '../../app/recipes';
import type { CartCraftDb } from '../../data/db';
import { createTestDb, sequentialIds } from '../../test/db';
import { renderRoutes } from '../../test/render';
import { ListScreen } from './ListScreen';
import { ListsScreen } from './ListsScreen';

async function seededList(): Promise<{ db: CartCraftDb; listId: string }> {
  const db = createTestDb();
  const ids = sequentialIds('s');
  const text = '2 onions\n1 cup milk\nSalt, to taste';
  const recipeId = await saveRecipe(db, { title: 'Soup', rawText: text, baseServings: 4, ingredients: draftLinesFromText(text, ids) }, 1, ids);
  const listId = await createList(db, [{ recipeId, targetServings: 4 }], Date.UTC(2026, 9, 1, 12), ids);
  return { db, listId };
}

const routes = [
  { path: '/lists', element: <ListsScreen /> },
  { path: '/lists/:id', element: <ListScreen makeId={sequentialIds('new')} now={() => 50} undoMs={60_000} /> },
];

describe('ListsScreen', () => {
  it('shows saved lists with progress and deletes after confirm', async () => {
    const { db } = await seededList();
    const { user } = renderRoutes(routes, '/lists', db);
    expect(await screen.findByText('Shopping list, Oct 1')).toBeInTheDocument();
    expect(screen.getByText('0 of 3 items checked')).toBeInTheDocument();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: 'Delete Shopping list, Oct 1' }));
    expect(await screen.findByText(/No lists yet/)).toBeInTheDocument();
  });
});

describe('ListScreen', () => {
  it('groups items by aisle with a pantry section', async () => {
    const { db, listId } = await seededList();
    renderRoutes(routes, `/lists/${listId}`, db);
    const produce = await screen.findByRole('region', { name: 'Produce' });
    expect(within(produce).getByRole('button', { name: 'Onions: 2' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Dairy & Eggs' })).getByRole('button', { name: 'Milk: 1 cup' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Check pantry' })).getByRole('button', { name: 'Salt' })).toBeInTheDocument();
  });

  it('moves a checked item into In cart and can undo', async () => {
    const { db, listId } = await seededList();
    const { user } = renderRoutes(routes, `/lists/${listId}`, db);
    await user.click(await screen.findByRole('button', { name: 'Onions: 2' }));
    expect(await screen.findByText('In cart (1)')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Produce' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await screen.findByRole('region', { name: 'Produce' })).toBeInTheDocument();
    expect(screen.queryByText('In cart (1)')).not.toBeInTheDocument();
  });

  it('adds an ad-hoc item into its aisle', async () => {
    const { db, listId } = await seededList();
    const { user } = renderRoutes(routes, `/lists/${listId}`, db);
    await user.type(await screen.findByLabelText('Add an item'), 'paper towels');
    await user.click(screen.getByRole('button', { name: 'Add item' }));
    const household = await screen.findByRole('region', { name: 'Household' });
    expect(within(household).getByRole('button', { name: 'Paper towels' })).toBeInTheDocument();
  });

  it('moves an item to another aisle and remembers it', async () => {
    const { db, listId } = await seededList();
    const { user } = renderRoutes(routes, `/lists/${listId}`, db);
    await user.click(await screen.findByRole('button', { name: 'Options for milk' }));
    await user.selectOptions(screen.getByLabelText('Aisle for milk'), 'frozen');
    expect(await screen.findByRole('region', { name: 'Frozen' })).toBeInTheDocument();
    expect(await db.aisleOverrides.get('milk')).toMatchObject({ aisleId: 'frozen', source: 'user' });
  });

  it('edits and deletes an item', async () => {
    const { db, listId } = await seededList();
    const { user } = renderRoutes(routes, `/lists/${listId}`, db);
    await user.click(await screen.findByRole('button', { name: 'Options for milk' }));
    const input = screen.getByLabelText('Edit milk');
    await user.clear(input);
    await user.type(input, '2 cups oat milk');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('button', { name: 'Oat milk: 2 cups' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Options for oat milk' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Oat milk: 2 cups' })).not.toBeInTheDocument());
  });

  it('copies the list as text', async () => {
    const { db, listId } = await seededList();
    const { user } = renderRoutes(routes, `/lists/${listId}`, db);
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    await user.click(await screen.findByRole('button', { name: 'Copy list as text' }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Produce\n- Onions: 2'));
    expect(await screen.findByText('Copied to clipboard')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/ui/screens/ListScreens.test.tsx`
Expected: FAIL, imports `./ListScreen` and `./ListsScreen` cannot be resolved.

- [ ] **Step 3: Implement `src/ui/components/ListItemRow.tsx`**

```tsx
import { Check, MoreHorizontal } from 'lucide-react';
import { useState } from 'react';
import { formatAmounts, type ListItem, type UnitSystem } from '../../domain';
import { itemLabel } from '../../app/listView';
import type { Aisle } from '../../data/types';

interface Props {
  item: ListItem;
  aisles: Aisle[];
  unitSystem: UnitSystem;
  onToggle: () => void;
  onEdit: (text: string) => void;
  onDelete: () => void;
  onMove: (aisleId: string) => void;
}

/** One shopping row. The whole row toggles; the menu button reveals edit, move and delete. */
export function ListItemRow({ item, aisles, unitSystem, onToggle, onEdit, onDelete, onMove }: Props) {
  const [open, setOpen] = useState(false);
  const amount = formatAmounts(item.amounts, unitSystem);
  const [draft, setDraft] = useState(amount ? `${amount} ${item.name}` : item.name);

  return (
    <li className="rounded-lg bg-white">
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={item.checked}
          aria-label={itemLabel(item, unitSystem)}
          className="flex min-h-12 flex-1 items-center gap-3 px-3 py-2 text-left"
        >
          <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${item.checked ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300'}`}>
            {item.checked && <Check size={14} className="text-white" />}
          </span>
          <span className={`min-w-0 flex-1 ${item.checked ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
            <span className="font-medium">{item.name.charAt(0).toUpperCase() + item.name.slice(1)}</span>
            {amount && <span className="ml-2 text-slate-500">{amount}</span>}
            {item.notes && <span className="block text-xs text-slate-400">{item.notes}</span>}
          </span>
        </button>
        <button type="button" onClick={() => setOpen(!open)} className="px-3 text-slate-400" aria-label={`Options for ${item.name}`} aria-expanded={open}>
          <MoreHorizontal size={18} />
        </button>
      </div>
      {open && (
        <div className="space-y-2 border-t border-slate-100 px-3 py-2 text-sm">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (draft.trim()) {
                onEdit(draft);
                setOpen(false);
              }
            }}
          >
            <input className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={`Edit ${item.name}`} />
            <button type="submit" className="rounded bg-slate-900 px-3 py-1 text-white">Save</button>
          </form>
          <div className="flex items-center gap-2">
            <label className="flex flex-1 items-center gap-2">
              Aisle
              <select className="flex-1 rounded border border-slate-200 px-2 py-1" value={item.aisleId} onChange={(e) => onMove(e.target.value)} aria-label={`Aisle for ${item.name}`}>
                {aisles.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
            <button type="button" onClick={onDelete} className="font-medium text-red-700">Delete</button>
          </div>
        </div>
      )}
    </li>
  );
}
```

- [ ] **Step 4: Implement `src/ui/screens/ListsScreen.tsx`**

```tsx
import { useLiveQuery } from 'dexie-react-hooks';
import { Trash2 } from 'lucide-react';
import { Link } from 'react-router';
import { deleteList } from '../../app/lists';
import { useDb } from '../db';

/** Saved lists, newest first. */
export function ListsScreen() {
  const db = useDb();
  const lists = useLiveQuery(() => db.lists.orderBy('createdAt').reverse().toArray(), [db]);
  if (!lists) return null;

  const onDelete = async (id: string, name: string) => {
    if (window.confirm(`Delete "${name}"?`)) await deleteList(db, id);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Lists</h1>
      {lists.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
          No lists yet. Select recipes and build one.
        </p>
      ) : (
        <ul className="space-y-2">
          {lists.map((list) => {
            const checked = list.items.filter((i) => i.checked).length;
            return (
              <li key={list.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
                <Link to={`/lists/${list.id}`} className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-900">{list.name}</p>
                  <p className="text-xs text-slate-500">
                    {checked} of {list.items.length} items checked
                  </p>
                </Link>
                <button
                  type="button"
                  onClick={() => void onDelete(list.id, list.name)}
                  className="p-2 text-slate-400 hover:text-red-600"
                  aria-label={`Delete ${list.name}`}
                >
                  <Trash2 size={16} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Implement `src/ui/screens/ListScreen.tsx`**

```tsx
import { useLiveQuery } from 'dexie-react-hooks';
import { Copy, Pencil, Plus } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useParams } from 'react-router';
import type { ListItem } from '../../domain';
import { newId } from '../../app/ids';
import {
  addAdhocItem, deleteItem, editItem, moveItemToAisle, renameList, setItemChecked,
} from '../../app/lists';
import { groupListItems, listAsText } from '../../app/listView';
import { ListItemRow } from '../components/ListItemRow';
import { useDb } from '../db';
import { useAisles, useSettings } from '../hooks';

interface Props {
  makeId?: () => string;
  now?: () => number;
  undoMs?: number;
}

/** Shopping mode for one saved list. */
export function ListScreen({ makeId = newId, now = Date.now, undoMs = 5000 }: Props) {
  const { id = '' } = useParams();
  const db = useDb();
  const settings = useSettings();
  const aisles = useAisles();
  const list = useLiveQuery(() => db.lists.get(id), [db, id]);
  const [adhoc, setAdhoc] = useState('');
  const [undo, setUndo] = useState<ListItem | null>(null);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  if (list === undefined || aisles === undefined) return null;
  if (list === null) return <p className="text-slate-500">List not found.</p>;

  const view = groupListItems(list.items, aisles);

  const toggle = async (item: ListItem) => {
    const checking = !item.checked;
    await setItemChecked(db, list.id, item.id, checking, now());
    clearTimeout(timer.current);
    if (checking) {
      setUndo(item);
      timer.current = setTimeout(() => setUndo(null), undoMs);
    } else {
      setUndo(null);
    }
  };

  const undoCheck = async () => {
    if (!undo) return;
    await setItemChecked(db, list.id, undo.id, false, now());
    setUndo(null);
  };

  const onAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!adhoc.trim()) return;
    await addAdhocItem(db, list.id, adhoc, makeId);
    setAdhoc('');
  };

  const onRename = async () => {
    const name = window.prompt('List name', list.name);
    if (name?.trim()) await renameList(db, list.id, name);
  };

  const onCopy = async () => {
    await navigator.clipboard.writeText(listAsText(list.name, list.items, aisles, settings.unitSystem));
    setCopied(true);
  };

  const row = (item: ListItem) => (
    <ListItemRow
      key={item.id}
      item={item}
      aisles={aisles}
      unitSystem={settings.unitSystem}
      onToggle={() => void toggle(item)}
      onEdit={(text) => void editItem(db, list.id, item.id, text)}
      onDelete={() => void deleteItem(db, list.id, item.id)}
      onMove={(aisleId) => void moveItemToAisle(db, list.id, item.id, aisleId)}
    />
  );

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-24">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{list.name}</h1>
          <p className="text-sm text-slate-500">From {list.sources.map((s) => `${s.title} (${s.targetServings})`).join(', ')}</p>
        </div>
        <div className="flex shrink-0 gap-1">
          <button type="button" onClick={() => void onRename()} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Rename list">
            <Pencil size={18} />
          </button>
          <button type="button" onClick={() => void onCopy()} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Copy list as text">
            <Copy size={18} />
          </button>
        </div>
      </div>
      {copied && <p role="status" className="text-sm text-emerald-700">Copied to clipboard</p>}

      <form onSubmit={onAdd} className="flex gap-2">
        <input
          className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2"
          placeholder="Add an item, e.g. paper towels"
          aria-label="Add an item"
          value={adhoc}
          onChange={(e) => setAdhoc(e.target.value)}
        />
        <button type="submit" className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-white" aria-label="Add item">
          <Plus size={18} />
        </button>
      </form>

      {view.aisles.map((section) => (
        <section key={section.id} aria-label={section.title}>
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{section.title}</h2>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">{section.items.map(row)}</ul>
        </section>
      ))}

      {view.pantry.length > 0 && (
        <section aria-label="Check pantry">
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Check pantry</h2>
          <ul className="divide-y divide-slate-100 rounded-xl border border-dashed border-slate-300">{view.pantry.map(row)}</ul>
        </section>
      )}

      {view.inCart.length > 0 && (
        <details className="rounded-xl border border-slate-200 bg-slate-50" aria-label="In cart">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-slate-600">In cart ({view.inCart.length})</summary>
          <ul className="divide-y divide-slate-100">{view.inCart.map(row)}</ul>
        </details>
      )}

      {undo && (
        <div role="status" className="fixed inset-x-0 bottom-20 mx-auto flex w-fit items-center gap-4 rounded-full bg-slate-900 px-4 py-2 text-sm text-white shadow-lg md:bottom-6">
          Checked {undo.name}
          <button type="button" onClick={() => void undoCheck()} className="font-semibold text-emerald-300">Undo</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Run tests and typecheck**

Run: `npx vitest run src/ui/screens/ListScreens.test.tsx && npm run typecheck`
Expected: PASS; `tsc` prints nothing.

- [ ] **Step 7: Commit**

```bash
git add src/ui/components/ListItemRow.tsx src/ui/screens/ListsScreen.tsx src/ui/screens/ListScreen.tsx src/ui/screens/ListScreens.test.tsx
git commit -m "feat(ui): list history and shopping mode with check-off, undo and edits"
```

---

### Task 9: Settings screen

**Files:**
- Create: `src/ui/screens/SettingsScreen.tsx`
- Test: `src/ui/screens/SettingsScreen.test.tsx`

**Interfaces:**
- Consumes: `addPantryStaple`, `moveAisle`, `removePantryStaple`, `renameAisle`; `backupFileName`, `exportBackup`, `importBackup`, `parseBackup`, `serializeBackup`, `summarizeBackup`, `undoLastImport`, `BackupFile`, `ParseResult`; `updateSettings`; `useDb`, `useAisles`, `useSettings`.
- Produces: `SettingsScreen({ now? })` at `/settings` with sections "Units and servings", "Pantry staples", "Aisles", "Backup", "Storage". Controls: unit radios "US (cups, oz, lb)" and "Metric (ml, g, kg)", "Default servings" input (local draft, saves positive whole numbers), "New pantry staple" input with "Add", "Remove {key}" buttons, "Name of {aisle}" inputs, "Move {aisle} up/down", "Export backup", "Share backup" (only when `navigator.canShare({ files })` is true; shares a `text/plain` file named `.txt`), "Import file", "Or paste a backup" with "Paste backup" textarea and "Check backup", a confirm alert with "Replace my data" and "Cancel", and "Undo last import" when a snapshot exists.

- [ ] **Step 1: Write the failing test `src/ui/screens/SettingsScreen.test.tsx`**

```tsx
// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { draftLinesFromText, saveRecipe } from '../../app/recipes';
import { exportBackup, serializeBackup } from '../../data/backup';
import { getSettings } from '../../data/db';
import { createTestDb, sequentialIds } from '../../test/db';
import { renderRoutes } from '../../test/render';
import { SettingsScreen } from './SettingsScreen';

const routes = [{ path: '/settings', element: <SettingsScreen now={() => Date.UTC(2026, 9, 1)} /> }];

describe('SettingsScreen', () => {
  it('saves the unit system and default servings', async () => {
    const { user, db } = renderRoutes(routes, '/settings');
    await user.click(await screen.findByLabelText('Metric (ml, g, kg)'));
    await waitFor(async () => expect((await getSettings(db)).unitSystem).toBe('metric'));
    const servings = screen.getByLabelText('Default servings');
    await user.clear(servings);
    await user.type(servings, '6');
    await waitFor(async () => expect((await getSettings(db)).defaultServings).toBe(6));
  });

  it('adds and removes pantry staples', async () => {
    const { user, db } = renderRoutes(routes, '/settings');
    await user.type(await screen.findByLabelText('New pantry staple'), 'Garlic Powder');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('garlic powder')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove garlic powder' }));
    await waitFor(async () => expect(await db.pantryStaples.get('garlic powder')).toBeUndefined());
  });

  it('reorders and renames aisles', async () => {
    const { user, db } = renderRoutes(routes, '/settings');
    await user.click(await screen.findByRole('button', { name: 'Move Meat & Seafood up' }));
    await waitFor(async () => expect((await db.aisles.orderBy('order').first())?.id).toBe('meat-seafood'));
    const name = screen.getByLabelText('Name of Produce');
    await user.clear(name);
    await user.type(name, 'Fruit & Veg');
    await user.tab();
    await waitFor(async () => expect((await db.aisles.get('produce'))?.name).toBe('Fruit & Veg'));
  });

  it('exports a backup file', async () => {
    const createObjectURL = vi.fn(() => 'blob:backup');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const { user } = renderRoutes(routes, '/settings');
    await user.click(await screen.findByRole('button', { name: 'Export backup' }));
    expect(await screen.findByText('Backup downloaded.')).toBeInTheDocument();
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('hides Share when the browser cannot share files', async () => {
    renderRoutes(routes, '/settings');
    await screen.findByRole('button', { name: 'Export backup' });
    expect(screen.queryByRole('button', { name: 'Share backup' })).not.toBeInTheDocument();
  });

  it('shares the backup as a text file when supported', async () => {
    const share = vi.fn(async () => undefined);
    Object.assign(navigator, { share, canShare: () => true });
    const { user } = renderRoutes(routes, '/settings');
    await user.click(await screen.findByRole('button', { name: 'Share backup' }));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const [{ files }] = share.mock.calls[0] as unknown as [{ files: File[] }];
    expect(files[0]?.name).toBe('cartcraft-backup-2026-10-01.txt');
    expect(files[0]?.type).toBe('text/plain');
    Reflect.deleteProperty(navigator, 'share');
    Reflect.deleteProperty(navigator, 'canShare');
  });

  it('imports a pasted backup after confirmation and can undo', async () => {
    const source = createTestDb();
    const ids = sequentialIds('r');
    await saveRecipe(source, { title: 'Soup', rawText: '1 onion', baseServings: 2, ingredients: draftLinesFromText('1 onion', ids) }, 1, ids);
    const text = serializeBackup(await exportBackup(source, 1));

    const { user, db } = renderRoutes(routes, '/settings');
    await user.click(await screen.findByText('Or paste a backup'));
    await user.click(screen.getByLabelText('Paste backup'));
    await user.paste(text);
    await user.click(screen.getByRole('button', { name: 'Check backup' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('This backup has 1 recipes, 0 lists');
    await user.click(within(alert).getByRole('button', { name: 'Replace my data' }));
    await waitFor(async () => expect(await db.recipes.count()).toBe(1));

    await user.click(await screen.findByRole('button', { name: 'Undo last import' }));
    await waitFor(async () => expect(await db.recipes.count()).toBe(0));
    expect(await screen.findByText('Previous data restored.')).toBeInTheDocument();
  });

  it('explains a rejected backup', async () => {
    const { user } = renderRoutes(routes, '/settings');
    await user.click(await screen.findByText('Or paste a backup'));
    await user.type(screen.getByLabelText('Paste backup'), 'hello');
    await user.click(screen.getByRole('button', { name: 'Check backup' }));
    expect(await screen.findByText('That is not a valid backup file (not JSON).')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/ui/screens/SettingsScreen.test.tsx`
Expected: FAIL, import `./SettingsScreen` cannot be resolved.

- [ ] **Step 3: Implement `src/ui/screens/SettingsScreen.tsx`**

```tsx
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { addPantryStaple, moveAisle, removePantryStaple, renameAisle } from '../../app/settings';
import {
  backupFileName, exportBackup, importBackup, parseBackup, serializeBackup, summarizeBackup, undoLastImport,
  type BackupFile, type ParseResult,
} from '../../data/backup';
import { updateSettings } from '../../data/db';
import { useDb } from '../db';
import { useAisles, useSettings } from '../hooks';

const IMPORT_ERRORS: Record<Exclude<ParseResult, { ok: true }>['error'], string> = {
  too_large: 'That file is too large to be a CartCraft backup.',
  not_json: 'That is not a valid backup file (not JSON).',
  wrong_format: 'That file is not a CartCraft backup.',
  newer_version: 'That backup comes from a newer version of CartCraft. Update this app first.',
  invalid: 'That backup is damaged or incomplete.',
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4" aria-label={title}>
      <h2 className="font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}

/** Keeps a local draft so the field can be cleared while typing; saves only positive whole numbers. */
function DefaultServings({ value, onSave }: { value: number; onSave: (n: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <label className="flex items-center gap-3">
      Default servings
      <input
        type="number"
        min={1}
        className="w-20 rounded border border-slate-200 px-2 py-1"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value !== '' && Number.isInteger(n) && n > 0) onSave(n);
        }}
        onBlur={() => setDraft(String(value))}
      />
    </label>
  );
}

/** Share sheets accept text/plain files but not application/json, so shared backups use a .txt name. */
function shareableFile(text: string, fileName: string): File {
  return new File([text], fileName.replace(/\.json$/, '.txt'), { type: 'text/plain' });
}

function canShareFiles(): boolean {
  try {
    return typeof navigator.share === 'function' && navigator.canShare?.({ files: [shareableFile('', 'probe.json')] }) === true;
  } catch {
    return false;
  }
}

function download(text: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

interface Props {
  now?: () => number;
}

export function SettingsScreen({ now = Date.now }: Props) {
  const db = useDb();
  const settings = useSettings();
  const aisles = useAisles();
  const pantry = useLiveQuery(() => db.pantryStaples.orderBy('itemKey').toArray(), [db]);
  const canUndo = useLiveQuery(async () => (await db.snapshots.get('last-import')) !== undefined, [db]);
  const [staple, setStaple] = useState('');
  const [pasted, setPasted] = useState('');
  const [pending, setPending] = useState<BackupFile | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [usage, setUsage] = useState<string | null>(null);
  const [shareable] = useState(canShareFiles);

  useEffect(() => {
    void navigator.storage?.estimate?.().then((e) => {
      if (e.usage !== undefined) setUsage(`${(e.usage / 1024 / 1024).toFixed(1)} MB used`);
    });
  }, []);

  const onAddStaple = async (e: FormEvent) => {
    e.preventDefault();
    if (await addPantryStaple(db, staple)) setStaple('');
  };

  const onExport = async () => {
    const at = now();
    download(serializeBackup(await exportBackup(db, at)), backupFileName(at));
    setMessage('Backup downloaded.');
  };

  const onShare = async () => {
    const at = now();
    const file = shareableFile(serializeBackup(await exportBackup(db, at)), backupFileName(at));
    try {
      await navigator.share({ files: [file], title: 'CartCraft backup' });
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) setMessage('Sharing failed. Use Export backup instead.');
    }
  };

  const readImport = (text: string) => {
    const result = parseBackup(text);
    if (result.ok) {
      setPending(result.backup);
      setMessage(null);
    } else {
      setPending(null);
      setMessage(IMPORT_ERRORS[result.error]);
    }
  };

  const onFile = async (file: File | undefined) => {
    if (file) readImport(await file.text());
  };

  const onConfirmImport = async () => {
    if (!pending) return;
    await importBackup(db, pending, now());
    setPending(null);
    setPasted('');
    setMessage('Import complete. Your previous data can be restored with Undo last import.');
  };

  const onUndo = async () => {
    if (await undoLastImport(db)) setMessage('Previous data restored.');
  };

  const summary = pending ? summarizeBackup(pending.data) : null;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>

      <Section title="Units and servings">
        <fieldset className="flex gap-4">
          <legend className="sr-only">Unit system</legend>
          {(['us', 'metric'] as const).map((system) => (
            <label key={system} className="flex items-center gap-2">
              <input type="radio" name="units" checked={settings.unitSystem === system} onChange={() => void updateSettings(db, { unitSystem: system })} />
              {system === 'us' ? 'US (cups, oz, lb)' : 'Metric (ml, g, kg)'}
            </label>
          ))}
        </fieldset>
        <DefaultServings value={settings.defaultServings} onSave={(n) => void updateSettings(db, { defaultServings: n })} />
      </Section>

      <Section title="Pantry staples">
        <p className="text-sm text-slate-500">These go in a "Check pantry" section instead of an aisle.</p>
        <ul className="flex flex-wrap gap-2">
          {pantry?.map((p) => (
            <li key={p.itemKey} className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-1 pl-3 pr-1 text-sm">
              {p.itemKey}
              <button type="button" onClick={() => void removePantryStaple(db, p.itemKey)} className="rounded-full p-1 hover:bg-white" aria-label={`Remove ${p.itemKey}`}>
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
        <form onSubmit={onAddStaple} className="flex gap-2">
          <input className="flex-1 rounded border border-slate-200 px-2 py-1" value={staple} onChange={(e) => setStaple(e.target.value)} aria-label="New pantry staple" placeholder="e.g. garlic powder" />
          <button type="submit" className="rounded bg-slate-900 px-3 py-1 text-sm text-white">Add</button>
        </form>
      </Section>

      <Section title="Aisles">
        <p className="text-sm text-slate-500">Lists follow this order. Rename aisles to match your store.</p>
        <ol className="space-y-1">
          {aisles?.map((aisle, index) => (
            <li key={aisle.id} className="flex items-center gap-2">
              <input
                className="flex-1 rounded border border-slate-200 px-2 py-1"
                defaultValue={aisle.name}
                aria-label={`Name of ${aisle.name}`}
                onBlur={(e) => e.target.value.trim() && e.target.value !== aisle.name && void renameAisle(db, aisle.id, e.target.value)}
              />
              <button type="button" disabled={index === 0} onClick={() => void moveAisle(db, aisle.id, 'up')} className="p-1 disabled:opacity-30" aria-label={`Move ${aisle.name} up`}>
                <ArrowUp size={16} />
              </button>
              <button type="button" disabled={index === aisles.length - 1} onClick={() => void moveAisle(db, aisle.id, 'down')} className="p-1 disabled:opacity-30" aria-label={`Move ${aisle.name} down`}>
                <ArrowDown size={16} />
              </button>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Backup">
        <p className="text-sm text-slate-500">
          Data lives only on this device. Export a backup to move it to another device. Your AI key is never included.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void onExport()} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white">Export backup</button>
          {shareable && (
            <button type="button" onClick={() => void onShare()} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Share backup</button>
          )}
          <label className="cursor-pointer rounded-lg border border-slate-300 px-4 py-2 text-sm">
            Import file
            <input type="file" accept=".json,application/json,text/plain" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
          </label>
          {canUndo && (
            <button type="button" onClick={() => void onUndo()} className="rounded-lg border border-amber-400 px-4 py-2 text-sm text-amber-800">Undo last import</button>
          )}
        </div>
        <details>
          <summary className="cursor-pointer text-sm text-slate-600">Or paste a backup</summary>
          <textarea className="mt-2 h-24 w-full rounded border border-slate-200 p-2 font-mono text-xs" value={pasted} onChange={(e) => setPasted(e.target.value)} aria-label="Paste backup" />
          <button type="button" disabled={!pasted.trim()} onClick={() => readImport(pasted)} className="mt-1 rounded border border-slate-300 px-3 py-1 text-sm disabled:opacity-40">Check backup</button>
        </details>
        {summary && (
          <div role="alert" className="space-y-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            <p>
              This backup has {summary.recipes} recipes, {summary.lists} lists, {summary.pantryStaples} pantry staples and{' '}
              {summary.aisleOverrides} aisle choices. Importing replaces everything on this device.
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => void onConfirmImport()} className="rounded bg-amber-700 px-3 py-1 text-white">Replace my data</button>
              <button type="button" onClick={() => setPending(null)} className="rounded border border-amber-300 px-3 py-1">Cancel</button>
            </div>
          </div>
        )}
        {message && <p role="status" className="text-sm text-slate-700">{message}</p>}
      </Section>

      <Section title="Storage">
        <p className="text-sm text-slate-600">
          {settings.persistGranted === true && 'This browser will keep your data. '}
          {settings.persistGranted === false && 'This browser may clear your data when space runs low. Export backups regularly. '}
          {settings.persistGranted === undefined && 'Storage protection is requested after you save your first recipe. '}
          {usage}
        </p>
      </Section>
    </div>
  );
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run src/ui/screens/SettingsScreen.test.tsx && npm run typecheck`
Expected: PASS; `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens/SettingsScreen.tsx src/ui/screens/SettingsScreen.test.tsx
git commit -m "feat(ui): settings for units, pantry, aisles, backup and storage"
```

---

### Task 10: App shell, Tailwind, and removal of the old UI

**Files:**
- Create: `src/ui/Layout.tsx`, `src/ui/App.tsx`, `src/main.tsx`, `src/index.css`
- Modify: `index.html`, `vite.config.ts`, `tsconfig.json`
- Delete: `App.tsx`, `index.tsx`, `components/`, `constants.ts`, `types.ts`, `services/`
- Test: `src/ui/App.test.tsx`

**Interfaces:**
- Consumes: all screens; `CartCraftDb`; `DbProvider`.
- Produces: `Layout()` with a "Main" nav (desktop) and a "Tabs" nav (mobile) linking Recipes `/`, Lists `/lists`, Settings `/settings`; `AppRoutes()` with routes `/`, `/recipes/new`, `/recipes/:id`, `/lists`, `/lists/:id`, `/settings`, and unknown paths redirecting to `/`.

- [ ] **Step 1: Write the failing test `src/ui/App.test.tsx`**

```tsx
// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { createTestDb } from '../test/db';
import { AppRoutes } from './App';
import { DbProvider } from './db';

function renderApp(url: string) {
  const user = userEvent.setup();
  render(
    <DbProvider db={createTestDb()}>
      <MemoryRouter initialEntries={[url]}>
        <AppRoutes />
      </MemoryRouter>
    </DbProvider>,
  );
  return { user };
}

describe('AppRoutes', () => {
  it('starts on Recipes and navigates with the tab bar', async () => {
    const { user } = renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Recipes' })).toBeInTheDocument();
    const tabs = screen.getByRole('navigation', { name: 'Tabs' });
    await user.click(within(tabs).getByRole('link', { name: 'Lists' }));
    expect(await screen.findByRole('heading', { name: 'Lists' })).toBeInTheDocument();
    await user.click(within(tabs).getByRole('link', { name: 'Settings' }));
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument();
  });

  it('opens the add recipe screen', async () => {
    const { user } = renderApp('/');
    await user.click(await screen.findByRole('link', { name: 'Add recipe' }));
    expect(await screen.findByRole('heading', { name: 'Add recipe' })).toBeInTheDocument();
  });

  it('redirects unknown paths to Recipes', async () => {
    renderApp('/nope');
    expect(await screen.findByRole('heading', { name: 'Recipes' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/ui/App.test.tsx`
Expected: FAIL, import `./App` cannot be resolved.

- [ ] **Step 3: Implement `src/ui/Layout.tsx`**

```tsx
import { BookOpen, ChefHat, ListChecks, Settings } from 'lucide-react';
import { NavLink, Outlet } from 'react-router';

const TABS = [
  { to: '/', label: 'Recipes', icon: BookOpen, end: true },
  { to: '/lists', label: 'Lists', icon: ListChecks, end: false },
  { to: '/settings', label: 'Settings', icon: Settings, end: false },
] as const;

/** Top bar on desktop, bottom tab bar on mobile. */
export function Layout() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <NavLink to="/" className="flex items-center gap-2 font-semibold text-slate-900">
            <ChefHat size={20} /> CartCraft
          </NavLink>
          <nav aria-label="Main" className="hidden gap-1 md:flex">
            {TABS.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) => `rounded-full px-4 py-1.5 text-sm font-medium ${isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 pb-28 md:pb-10">
        <Outlet />
      </main>

      <nav aria-label="Tabs" className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        {TABS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => `flex min-h-14 flex-1 flex-col items-center justify-center text-xs ${isActive ? 'text-emerald-800' : 'text-slate-500'}`}
          >
            <Icon size={20} />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
```

- [ ] **Step 4: Implement `src/ui/App.tsx`**

```tsx
import { Navigate, Route, Routes } from 'react-router';
import { Layout } from './Layout';
import { ListScreen } from './screens/ListScreen';
import { ListsScreen } from './screens/ListsScreen';
import { RecipeEditorScreen } from './screens/RecipeEditorScreen';
import { RecipesScreen } from './screens/RecipesScreen';
import { SettingsScreen } from './screens/SettingsScreen';

/** All routes. Wrapped in a router and DbProvider by main.tsx (or by tests). */
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<RecipesScreen />} />
        <Route path="recipes/new" element={<RecipeEditorScreen />} />
        <Route path="recipes/:id" element={<RecipeEditorScreen />} />
        <Route path="lists" element={<ListsScreen />} />
        <Route path="lists/:id" element={<ListScreen />} />
        <Route path="settings" element={<SettingsScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run src/ui/App.test.tsx`
Expected: PASS.

- [ ] **Step 6: Create `src/index.css`**

```css
@import "tailwindcss";

@theme {
  --font-sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}

html {
  -webkit-text-size-adjust: 100%;
}
```

- [ ] **Step 7: Create `src/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { CartCraftDb } from './data/db';
import { AppRoutes } from './ui/App';
import { DbProvider } from './ui/db';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <DbProvider db={new CartCraftDb()}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </DbProvider>
  </StrictMode>,
);
```

- [ ] **Step 8: Replace `index.html`** (drops the Tailwind CDN script and Google Fonts; fonts are self-hosted in Plan 5)

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#064e3b" />
    <title>CartCraft</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 9: Replace `vite.config.ts`**

```ts
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
  },
  plugins: [react(), tailwindcss()],
});
```

- [ ] **Step 10: Replace `tsconfig.json`** (removes the unused `@` path alias)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": [
      "ES2022",
      "DOM",
      "DOM.Iterable"
    ],
    "skipLibCheck": true,
    "types": [
      "node"
    ],
    "moduleResolution": "bundler",
    "isolatedModules": true,
    "moduleDetection": "force",
    "jsx": "react-jsx",
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true
  },
  "include": [
    "src"
  ]
}
```

- [ ] **Step 11: Delete the old AI Studio UI**

```bash
git rm -r App.tsx index.tsx components constants.ts types.ts services
```

Expected: git lists the removed files; `ls` at the repo root no longer shows them.

- [ ] **Step 12: Run everything**

Run: `npm test && npm run typecheck && npm run build`
Expected: 23 test files and 269 tests PASS, `tsc` prints nothing, `vite build` ends with "built in" (a chunk-size warning is acceptable).

- [ ] **Step 13: Smoke test in the browser**

Run: `npm run dev`, open http://localhost:3000, then:
1. Recipes > Add recipe, paste `2 cups flour`, `1 (14 oz) can diced tomatoes`, `salt and pepper to taste`, click "Parse ingredients". Expected: 3 review rows, the third highlighted with a warning icon; Base servings shows 4.
2. Enter title "Tomato bread", click "Save recipe". Expected: back on Recipes with "Tomato bread, 3 ingredients, serves 4".
3. Select it and click "Build list (1)". Expected: list page with Pantry & Dry Goods (Flour 2 cups), Canned & Jarred (Diced tomatoes 1 can (14 oz)), Spices & Oils (Salt and pepper, to taste).
4. Tap Flour. Expected: it moves under "In cart (1)" and a "Checked flour, Undo" toast appears.
5. Browser console shows no errors.

- [ ] **Step 14: Replace `README.md`**

````markdown
# CartCraft

Turn a set of saved recipes into one consolidated, aisle-sorted shopping list.

Everything runs in your browser and works offline. Data stays on the device; use Settings > Backup to move it between devices.

## Run locally

Prerequisites: Node.js 22

```bash
npm install
npm run dev
```

The app runs at http://localhost:3000.

## Checks

```bash
npm test
npm run typecheck
npm run build
```

## Layout

- `src/domain/`: pure parsing, scaling, merging, formatting and aisle logic
- `src/data/`: IndexedDB schema (Dexie) and backup format
- `src/app/`: use cases that combine domain and storage
- `src/ui/`: React screens

Design: `docs/superpowers/specs/2026-10-01-cartcraft-rewrite-design.md`. Plans: `docs/superpowers/plans/`.
````

- [ ] **Step 15: Commit**

```bash
git add -A
git commit -m "feat(ui): app shell with routes, Tailwind, and removal of the AI Studio UI"
```

---

## Done when

- `npm test` passes 269 tests in 23 files; `npm run typecheck` and `npm run build` succeed.
- The smoke test in Task 10 Step 13 passes in a real browser with no console errors.
- No file at the repo root references Gemini, AI Studio, the Tailwind CDN, or esm.sh (`grep -rniE "gemini|ai.studio|cdn.tailwindcss|esm.sh" --include=*.ts --include=*.tsx --include=*.html --include=*.json . --exclude-dir=node_modules --exclude-dir=docs` prints nothing).

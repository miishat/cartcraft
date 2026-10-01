# CartCraft Plan 4: AI Helper and Remaining Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the optional AI helper (provider, model and key in Settings; clean up pasted text; "Try with AI" for pages without recipe data; sort unknown items into aisles; swaps and tips) and close the remaining Plan 2 issues on the List and Settings screens and in backup import.

**Architecture:** `src/services/providers.ts` lists the four OpenAI-compatible providers (it is also the CSP allowlist source for Plan 5). `src/services/llm/client.ts` makes one validated, non-streaming JSON-mode call with a timeout and maps every failure to a user-safe `LlmError`. `src/services/llm/jobs.ts` holds one prompt and one Zod schema per job and drops anything outside the allowed shape. `src/app/ai.ts` applies results with guard rails: AI lines go through the normal parser and review table, numbers missing from the source are flagged, and AI aisle answers never overwrite the user's own choices. The key lives only in the `secrets` table.

**Tech Stack:** React 19, Dexie 4, Zod 4, Vitest 3, `fetch` (no SDK).

**Spec:** [2026-10-01-cartcraft-rewrite-design.md](../specs/2026-10-01-cartcraft-rewrite-design.md) sections 6, 8, 9.2. **Roadmap:** [2026-10-01-roadmap.md](2026-10-01-roadmap.md). **Requires:** Plan 3 completed (383 passing tests, `useAsyncAction`, `ErrorNote`, `UserFacingError`, `fetchPageText`).

## Global Constraints

- `CLAUDE.md`: every user-visible change adds a line under `## [Unreleased]` in `CHANGELOG.md` in the same commit. The exact lines are given in each task.
- The AI is optional. Every AI button is visible but disabled without a key, next to a link "Add an AI key in Settings" (spec acceptance criterion 5). Errors render inline through `useAsyncAction` and `ErrorNote`.
- The API key is stored only in `db.secrets` (`{ id: 'secrets', llmApiKey }`), sent only as `Authorization: Bearer` to the selected provider's `baseUrl`, never logged, never put in an error message, never exported.
- One AI call per user action, no automatic retries, 45 s timeout, explicit token limit, `response_format: { type: 'json_object' }`. Every reply is validated with Zod; invalid replies raise `LlmError('bad_response')` and leave existing data unchanged.
- The AI never produces or changes list quantities. AI ingredient lines are parsed by `parseIngredientLine` and shown in the review table before saving.
- Layers: `src/services/` may import `src/domain/` and the leaf module `src/app/errors.ts` (it has no imports); `src/app/` may import `src/services/`.
- Provider facts (checked 2026-10-01): all four providers answer a browser CORS preflight. DeepSeek `deepseek-flash` (DeepSeek V4.1 Flash) at `https://api.deepseek.com`; OpenRouter `deepseek/deepseek-v4.1-flash`; OpenAI `gpt-6-luna`; Groq `openai/gpt-oss-20b`. Groq requires the word JSON in the prompt (all prompts include it). OpenAI and Groq get `max_completion_tokens`; OpenAI gets no `temperature`. These per-model details could not be verified without keys; the "Test connection" button surfaces any provider error.
- Do not use em dashes in code comments, docs or UI copy. Run commands from `C:\Users\misha\cartcraft` in Git Bash. UI test files start with `// @vitest-environment jsdom`.

## Open items from Plan 2 handled here

| Item | Task |
|---|---|
| Editing a list item drops its notes; edit draft goes stale | 1, 2 |
| Crafted backup with duplicate ids fails silently during import | 1 |
| Backup without an Other aisle (or a deleted aisle id) can hide list items | 1 |
| List and Settings screens call use cases without a catch | 2 |
| "Copied" never clears; Safari download revoked too early; file input not reset; blank aisle rename | 2 |
| File import was untested because jsdom lacks `Blob.text()` | 2 (test polyfill) |

## File Structure

| File | Responsibility |
|---|---|
| `src/app/listView.ts` (modify) | `itemEditText()`; orphaned items still shown in Other |
| `src/data/backup.ts` (modify) | reject duplicate keys; restore Other aisle and settings |
| `src/ui/components/ListItemRow.tsx` (modify) | edit text includes notes, refreshed on open, unchanged text not re-saved |
| `src/ui/screens/ListScreen.tsx` (modify) | `useAsyncAction` for every change; copy error and auto-clear; AI sort and swaps & tips |
| `src/ui/screens/SettingsScreen.tsx` (modify) | per-section errors; small fixes; AI helper section |
| `src/test/setup.ts` (modify) | `Blob.prototype.text` polyfill for jsdom |
| `src/services/providers.ts` | `PROVIDERS`, `getProvider()`, `providerOrigins()` |
| `src/services/llm/client.ts` | `chatJson()`, `LlmError` |
| `src/services/llm/jobs.ts` | `cleanUpRecipeText()`, `suggestAisles()`, `swapsAndTips()`, `checkConnection()` |
| `src/app/ai.ts` | key storage, `getLlmConfig()`, `aiCleanUpText()`, `aiSortUnknownItems()`, `aiSwapsAndTips()`, `testAiConnection()`, `hasInventedNumber()` |
| `src/ui/components/AiSettings.tsx` | provider, model, key, test connection |
| `src/ui/screens/RecipeEditorScreen.tsx` (modify) | "Clean up with AI", "Try with AI" |
| `src/domain/index.ts` (modify) | export `normalizeText` |

---

### Task 1: List edit text, backup integrity and orphaned items

**Files:**
- Modify: `src/app/listView.ts`, `src/app/listView.test.ts`, `src/app/lists.test.ts`, `src/data/backup.ts`, `src/data/backup.test.ts`, `CHANGELOG.md`

**Interfaces:**
- Consumes: `OTHER_AISLE`; `DEFAULT_SETTINGS`.
- Produces: `itemEditText(item: ListItem, system: UnitSystem): string` (for example "2 cups milk, whole"; `editItem` parses it back so notes survive). `groupListItems` adds an `{ id: 'other', title: 'Other' }` section for items whose aisle id is unknown when no Other aisle exists. `parseBackup` returns `{ ok: false, error: 'invalid', detail: 'duplicate <table>.<key>' }` for duplicate keys, and adds a missing Other aisle (order after the last aisle) and default settings when absent.

- [ ] **Step 1: Write the failing tests**

Replace `src/app/listView.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { ListItem } from '../domain';
import type { Aisle } from '../data/types';
import { groupListItems, itemEditText, itemLabel, listAsText } from './listView';

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

describe('items in aisles that no longer exist', () => {
  it('still appear in an Other section when the Other aisle is missing', () => {
    const view = groupListItems([item('1', 'thing', { aisleId: 'gone' })], aisles.filter((a) => a.id !== 'other'));
    expect(view.aisles.map((s) => [s.id, s.title, s.items.map((i) => i.name)])).toEqual([['other', 'Other', ['thing']]]);
  });
});

describe('itemEditText', () => {
  it('includes amount, name and notes', () => {
    expect(itemEditText(item('1', 'milk', { amounts: [{ quantity: { min: 473.176 }, unit: 'ml' }], notes: 'whole' }), 'us')).toBe('2 cups milk, whole');
    expect(itemEditText(item('2', 'paper towels'), 'us')).toBe('paper towels');
  });
});
```

Replace `src/app/lists.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatAmounts } from '../domain';
import type { CartCraftDb } from '../data/db';
import { createTestDb, sequentialIds } from '../test/db';
import {
  addAdhocItem, createList, defaultListName, deleteItem, deleteList, editItem, moveItemToAisle,
  renameList, setItemChecked,
} from './lists';
import { itemEditText } from './listView';
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

  it('keeps notes when editing through itemEditText', async () => {
    const { db, listId } = await withList();
    const id = await addAdhocItem(db, listId, '2 cups milk, whole', sequentialIds('adhoc'));
    const before = (await db.lists.get(listId))!.items.find((i) => i.id === id)!;
    await editItem(db, listId, id, itemEditText(before, 'us').replace('2 cups', '3 cups'));
    const after = (await db.lists.get(listId))!.items.find((i) => i.id === id)!;
    expect(after.notes).toBe('whole');
    expect(formatAmounts(after.amounts, 'us')).toBe('3 cups');
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

Append to `src/data/backup.test.ts`:

```ts
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
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/app/listView.test.ts src/app/lists.test.ts src/data/backup.test.ts`
Expected: FAIL: `itemEditText` is not exported; the duplicate backup parses as ok; the Other section is missing.

- [ ] **Step 3: Replace `src/app/listView.ts`**

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

  // A backup or edit can leave items pointing at aisles that no longer exist. Never hide them.
  if (!known.has(OTHER_AISLE)) {
    const orphans = unchecked.filter((i) => i.group === 'aisle' && !known.has(i.aisleId)).sort(byName);
    if (orphans.length > 0) sections.push({ id: OTHER_AISLE, title: 'Other', items: orphans });
  }

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

/**
 * Text shown in the item editor. `editItem` parses it back, so the amount, name and notes
 * ("2 cups milk, whole") all survive an edit.
 */
export function itemEditText(item: ListItem, system: UnitSystem): string {
  const amount = formatAmounts(item.amounts, system);
  const base = amount ? `${amount} ${item.name}` : item.name;
  return item.notes ? `${base}, ${item.notes}` : base;
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

- [ ] **Step 4: Replace `src/data/backup.ts`**

```ts
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
```

- [ ] **Step 5: Add the changelog line**

Under `## [Unreleased]` > `### Fixed`, add:

```markdown
- Backups with duplicate entries are rejected with a clear message instead of failing during import, and a backup without the Other aisle no longer hides list items.
```

- [ ] **Step 6: Run tests and typecheck**

Run: `npm test && npm run typecheck`
Expected: 31 files, 388 tests PASS; both `tsc` runs print nothing.

- [ ] **Step 7: Commit**

```bash
git add src/app/listView.ts src/app/listView.test.ts src/app/lists.test.ts src/data/backup.ts src/data/backup.test.ts CHANGELOG.md
git commit -m "fix(data): reject duplicate backup keys, restore Other aisle, keep notes in item edit text"
```

---

### Task 2: List and Settings error handling and small fixes

**Files:**
- Modify: `src/ui/screens/ListScreen.tsx`, `src/ui/components/ListItemRow.tsx`, `src/ui/screens/SettingsScreen.tsx`, `src/test/setup.ts`, `CHANGELOG.md`
- Create: `src/ui/screens/ListErrors.test.tsx`, `src/ui/screens/SettingsErrors.test.tsx`

**Interfaces:**
- Consumes: `useAsyncAction`, `ErrorNote`, `itemEditText`.
- Produces: `ListScreen` gains prop `copiedMs?: number` (default 3000). Inline messages: List "That change did not save. Try again." and "Could not copy. Select the list and copy it manually."; Settings per section ("Could not save that setting. Try again.", "Could not update pantry staples. Try again.", "Could not update aisles. Try again.") and Backup ("Could not create the backup. Try again.", "Could not read that file.", "Import failed. Your data was not changed.", "Could not restore the previous data. Try again.").

- [ ] **Step 1: Write the failing tests**

`src/ui/screens/ListErrors.test.tsx`:

```tsx
// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createList } from '../../app/lists';
import { draftLinesFromText, saveRecipe } from '../../app/recipes';
import type { CartCraftDb } from '../../data/db';
import { createTestDb, sequentialIds } from '../../test/db';
import { renderRoutes } from '../../test/render';
import { ListScreen } from './ListScreen';

async function seededList(): Promise<{ db: CartCraftDb; listId: string }> {
  const db = createTestDb();
  const ids = sequentialIds('s');
  const text = '2 onions, diced\n1 cup milk';
  const recipeId = await saveRecipe(db, { title: 'Soup', rawText: text, baseServings: 4, ingredients: draftLinesFromText(text, ids) }, 1, ids);
  const listId = await createList(db, [{ recipeId, targetServings: 4 }], 1, ids);
  return { db, listId };
}

const routes = [{ path: '/lists/:id', element: <ListScreen makeId={sequentialIds('new')} now={() => 50} undoMs={60_000} copiedMs={50} /> }];

describe('ListScreen fixes and error handling', () => {
  it('keeps notes when an item is edited', async () => {
    const { db, listId } = await seededList();
    const { user } = renderRoutes(routes, `/lists/${listId}`, db);
    await user.click(await screen.findByRole('button', { name: 'Options for onions' }));
    const input = screen.getByLabelText('Edit onions');
    expect(input).toHaveValue('2 onions, diced');
    await user.clear(input);
    await user.type(input, '3 onions, diced');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(async () => {
      const item = (await db.lists.get(listId))!.items.find((i) => i.itemKey === 'onion')!;
      expect(item.notes).toBe('diced');
      expect(item.amounts[0]?.quantity.min).toBe(3);
    });
  });

  it('does not re-save an item whose text did not change', async () => {
    const { db, listId } = await seededList();
    const { user } = renderRoutes(routes, `/lists/${listId}`, db);
    const update = vi.spyOn(db.lists, 'update');
    await user.click(await screen.findByRole('button', { name: 'Options for milk' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(update).not.toHaveBeenCalled();
  });

  it('shows an inline message when a change fails', async () => {
    const { db, listId } = await seededList();
    const { user } = renderRoutes(routes, `/lists/${listId}`, db);
    vi.spyOn(db.lists, 'update').mockRejectedValueOnce(new Error('disk'));
    await user.click(await screen.findByRole('button', { name: 'Milk: 1 cup' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That change did not save. Try again.');
  });

  it('explains a failed copy and clears the copied note after a while', async () => {
    const { db, listId } = await seededList();
    const { user } = renderRoutes(routes, `/lists/${listId}`, db);
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new Error('denied'));
    await user.click(await screen.findByRole('button', { name: 'Copy list as text' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not copy.');

    writeText.mockResolvedValueOnce();
    await user.click(screen.getByRole('button', { name: 'Copy list as text' }));
    expect(await screen.findByText('Copied to clipboard')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Copied to clipboard')).not.toBeInTheDocument());
  });
});
```

`src/ui/screens/SettingsErrors.test.tsx`:

```tsx
// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { draftLinesFromText, saveRecipe } from '../../app/recipes';
import { exportBackup, serializeBackup } from '../../data/backup';
import { createTestDb, sequentialIds } from '../../test/db';
import { renderRoutes } from '../../test/render';
import { SettingsScreen } from './SettingsScreen';

const routes = [{ path: '/settings', element: <SettingsScreen now={() => Date.UTC(2026, 9, 1)} /> }];

async function backupText(): Promise<string> {
  const source = createTestDb();
  const ids = sequentialIds('r');
  await saveRecipe(source, { title: 'Soup', rawText: '1 onion', baseServings: 2, ingredients: draftLinesFromText('1 onion', ids) }, 1, ids);
  return serializeBackup(await exportBackup(source, 1));
}

describe('SettingsScreen error handling', () => {
  it('reports a failed import and leaves data unchanged', async () => {
    const text = await backupText();
    const { user, db } = renderRoutes(routes, '/settings');
    await user.click(await screen.findByText('Or paste a backup'));
    await user.click(screen.getByLabelText('Paste backup'));
    await user.paste(text);
    await user.click(screen.getByRole('button', { name: 'Check backup' }));
    vi.spyOn(db.snapshots, 'put').mockRejectedValueOnce(new Error('quota'));
    const confirm = await screen.findByRole('button', { name: 'Replace my data' });
    await user.click(confirm);
    expect(await screen.findByText('Import failed. Your data was not changed.')).toBeInTheDocument();
    expect(await db.recipes.count()).toBe(0);
  });

  it('reports a failed setting change next to the control', async () => {
    const { user, db } = renderRoutes(routes, '/settings');
    vi.spyOn(db.settings, 'put').mockRejectedValueOnce(new Error('disk'));
    await user.click(await screen.findByLabelText('Metric (ml, g, kg)'));
    const section = screen.getByRole('region', { name: 'Units and servings' });
    expect(await within(section).findByRole('alert')).toHaveTextContent('Could not save that setting. Try again.');
  });

  it('restores the aisle name when it is cleared', async () => {
    const { user, db } = renderRoutes(routes, '/settings');
    const name = await screen.findByLabelText('Name of Produce');
    await user.clear(name);
    await user.tab();
    expect(name).toHaveValue('Produce');
    expect((await db.aisles.get('produce'))?.name).toBe('Produce');
  });

  it('accepts the same file twice in a row', async () => {
    const text = await backupText();
    const { user } = renderRoutes(routes, '/settings');
    const input = (await screen.findByText('Import file')).querySelector('input') as HTMLInputElement;
    const file = new File([text], 'backup.json', { type: 'application/json' });
    await user.upload(input, file);
    expect(await screen.findByRole('button', { name: 'Replace my data' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(input.value).toBe('');
    await user.upload(input, file);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Replace my data' })).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/ui/screens/ListErrors.test.tsx src/ui/screens/SettingsErrors.test.tsx`
Expected: FAIL: the edit box shows "2 onions" without notes, failures show no alert, the cleared aisle name stays blank, and the file upload never shows "Replace my data" (jsdom has no `Blob.text()`).

- [ ] **Step 3: Replace `src/test/setup.ts`**

```ts
import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom has no Blob.prototype.text (every browser does); file import tests need it.
if (typeof Blob !== 'undefined' && typeof Blob.prototype.text !== 'function') {
  Blob.prototype.text = function text(this: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(this);
    });
  };
}

afterEach(() => {
  cleanup();
});
```

- [ ] **Step 4: Replace `src/ui/components/ListItemRow.tsx`**

```tsx
import { Check, MoreHorizontal } from 'lucide-react';
import { useState } from 'react';
import { formatAmounts, type ListItem, type UnitSystem } from '../../domain';
import { itemEditText, itemLabel } from '../../app/listView';
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
  const editText = itemEditText(item, unitSystem);
  const [draft, setDraft] = useState(editText);

  const toggleMenu = () => {
    // Start from the item's current text each time, so edits made elsewhere are not overwritten.
    if (!open) setDraft(editText);
    setOpen(!open);
  };

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
        <button type="button" onClick={toggleMenu} className="px-3 text-slate-400" aria-label={`Options for ${item.name}`} aria-expanded={open}>
          <MoreHorizontal size={18} />
        </button>
      </div>
      {open && (
        <div className="space-y-2 border-t border-slate-100 px-3 py-2 text-sm">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!draft.trim()) return;
              // Re-parsing unchanged text can be lossy (for example "2 cloves + 1 tbsp"), so skip it.
              if (draft !== editText) onEdit(draft);
              setOpen(false);
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

- [ ] **Step 5: Replace `src/ui/screens/ListScreen.tsx`**

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
import { ErrorNote } from '../components/ErrorNote';
import { ListItemRow } from '../components/ListItemRow';
import { useDb } from '../db';
import { useAisles, useSettings } from '../hooks';
import { useAsyncAction } from '../useAsyncAction';

interface Props {
  makeId?: () => string;
  now?: () => number;
  undoMs?: number;
  copiedMs?: number;
}

/** Shopping mode for one saved list. */
export function ListScreen({ makeId = newId, now = Date.now, undoMs = 5000, copiedMs = 3000 }: Props) {
  const { id = '' } = useParams();
  const db = useDb();
  const settings = useSettings();
  const aisles = useAisles();
  const list = useLiveQuery(async () => (await db.lists.get(id)) ?? null, [db, id]);
  const [adhoc, setAdhoc] = useState('');
  const [undo, setUndo] = useState<ListItem | null>(null);
  const [copied, setCopied] = useState(false);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(
    () => () => {
      clearTimeout(undoTimer.current);
      clearTimeout(copiedTimer.current);
    },
    [],
  );

  /** Runs any list change; a failure shows one inline message instead of an unhandled rejection. */
  const act = useAsyncAction((fn: () => Promise<void>) => fn(), 'That change did not save. Try again.');
  const copy = useAsyncAction(async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), copiedMs);
  }, 'Could not copy. Select the list and copy it manually.');

  if (list === undefined || aisles === undefined) return null;
  if (list === null) return <p className="text-slate-500">List not found.</p>;

  const view = groupListItems(list.items, aisles);

  const toggle = (item: ListItem) =>
    act.run(async () => {
      const checking = !item.checked;
      await setItemChecked(db, list.id, item.id, checking, now());
      clearTimeout(undoTimer.current);
      if (checking) {
        setUndo(item);
        undoTimer.current = setTimeout(() => setUndo(null), undoMs);
      } else {
        setUndo(null);
      }
    });

  const undoCheck = () =>
    act.run(async () => {
      if (!undo) return;
      await setItemChecked(db, list.id, undo.id, false, now());
      setUndo(null);
    });

  const onAdd = (e: FormEvent) => {
    e.preventDefault();
    if (!adhoc.trim()) return;
    void act.run(async () => {
      await addAdhocItem(db, list.id, adhoc, makeId);
      setAdhoc('');
    });
  };

  const onRename = () => {
    const name = window.prompt('List name', list.name);
    if (name?.trim()) void act.run(() => renameList(db, list.id, name));
  };

  const row = (item: ListItem) => (
    <ListItemRow
      key={item.id}
      item={item}
      aisles={aisles}
      unitSystem={settings.unitSystem}
      onToggle={() => void toggle(item)}
      onEdit={(text) => void act.run(() => editItem(db, list.id, item.id, text))}
      onDelete={() => void act.run(() => deleteItem(db, list.id, item.id))}
      onMove={(aisleId) => void act.run(() => moveItemToAisle(db, list.id, item.id, aisleId))}
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
          <button type="button" onClick={onRename} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Rename list">
            <Pencil size={18} />
          </button>
          <button
            type="button"
            onClick={() => void copy.run(listAsText(list.name, list.items, aisles, settings.unitSystem))}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Copy list as text"
          >
            <Copy size={18} />
          </button>
        </div>
      </div>
      {copied && <p role="status" className="text-sm text-emerald-700">Copied to clipboard</p>}
      <ErrorNote message={act.error ?? copy.error} />

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

- [ ] **Step 6: Replace `src/ui/screens/SettingsScreen.tsx`**

```tsx
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { addPantryStaple, moveAisle, removePantryStaple, renameAisle } from '../../app/settings';
import {
  MAX_BACKUP_BYTES, backupFileName, exportBackup, importBackup, parseBackup, serializeBackup, summarizeBackup, undoLastImport,
  type BackupFile, type ParseResult,
} from '../../data/backup';
import { updateSettings } from '../../data/db';
import { ErrorNote } from '../components/ErrorNote';
import { useDb } from '../db';
import { useAisles, useSettings } from '../hooks';
import { useAsyncAction } from '../useAsyncAction';

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
  // Safari starts the download asynchronously; revoking at once can cancel it.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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

  const prefs = useAsyncAction((fn: () => Promise<void>) => fn(), 'Could not save that setting. Try again.');
  const pantryAction = useAsyncAction((fn: () => Promise<void>) => fn(), 'Could not update pantry staples. Try again.');
  const aisleAction = useAsyncAction((fn: () => Promise<void>) => fn(), 'Could not update aisles. Try again.');

  const exportAction = useAsyncAction(async () => {
    const at = now();
    download(serializeBackup(await exportBackup(db, at)), backupFileName(at));
    setMessage('Backup downloaded.');
  }, 'Could not create the backup. Try again.');

  const shareAction = useAsyncAction(async () => {
    const at = now();
    const file = shareableFile(serializeBackup(await exportBackup(db, at)), backupFileName(at));
    try {
      await navigator.share({ files: [file], title: 'CartCraft backup' });
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) setMessage('Sharing failed. Use Export backup instead.');
    }
  }, 'Could not create the backup. Try again.');

  const onAddStaple = (e: FormEvent) => {
    e.preventDefault();
    void pantryAction.run(async () => {
      if (await addPantryStaple(db, staple)) setStaple('');
    });
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

  const fileAction = useAsyncAction(async (file: File) => {
    if (file.size > MAX_BACKUP_BYTES) {
      setPending(null);
      setMessage(IMPORT_ERRORS.too_large);
      return;
    }
    readImport(await file.text());
  }, 'Could not read that file.');

  const importAction = useAsyncAction(async (backup: BackupFile) => {
    await importBackup(db, backup, now());
    setPending(null);
    setPasted('');
    setMessage('Import complete. Your previous data can be restored with Undo last import.');
  }, 'Import failed. Your data was not changed.');

  const undoAction = useAsyncAction(async () => {
    if (await undoLastImport(db)) setMessage('Previous data restored.');
  }, 'Could not restore the previous data. Try again.');

  const summary = pending ? summarizeBackup(pending.data) : null;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>

      <Section title="Units and servings">
        <fieldset className="flex gap-4">
          <legend className="sr-only">Unit system</legend>
          {(['us', 'metric'] as const).map((system) => (
            <label key={system} className="flex items-center gap-2">
              <input type="radio" name="units" checked={settings.unitSystem === system} onChange={() => void prefs.run(() => updateSettings(db, { unitSystem: system }))} />
              {system === 'us' ? 'US (cups, oz, lb)' : 'Metric (ml, g, kg)'}
            </label>
          ))}
        </fieldset>
        <DefaultServings value={settings.defaultServings} onSave={(n) => void prefs.run(() => updateSettings(db, { defaultServings: n }))} />
        <ErrorNote message={prefs.error} />
      </Section>

      <Section title="Pantry staples">
        <p className="text-sm text-slate-500">These go in a "Check pantry" section instead of an aisle.</p>
        <ul className="flex flex-wrap gap-2">
          {pantry?.map((p) => (
            <li key={p.itemKey} className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-1 pl-3 pr-1 text-sm">
              {p.itemKey}
              <button type="button" onClick={() => void pantryAction.run(() => removePantryStaple(db, p.itemKey))} className="rounded-full p-1 hover:bg-white" aria-label={`Remove ${p.itemKey}`}>
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
        <form onSubmit={onAddStaple} className="flex gap-2">
          <input className="flex-1 rounded border border-slate-200 px-2 py-1" value={staple} onChange={(e) => setStaple(e.target.value)} aria-label="New pantry staple" placeholder="e.g. garlic powder" />
          <button type="submit" className="rounded bg-slate-900 px-3 py-1 text-sm text-white">Add</button>
        </form>
        <ErrorNote message={pantryAction.error} />
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
                onBlur={(e) => {
                  const name = e.target.value.trim();
                  if (!name) e.target.value = aisle.name;
                  else if (name !== aisle.name) void aisleAction.run(() => renameAisle(db, aisle.id, name));
                }}
              />
              <button type="button" disabled={index === 0} onClick={() => void aisleAction.run(() => moveAisle(db, aisle.id, 'up'))} className="p-1 disabled:opacity-30" aria-label={`Move ${aisle.name} up`}>
                <ArrowUp size={16} />
              </button>
              <button type="button" disabled={index === aisles.length - 1} onClick={() => void aisleAction.run(() => moveAisle(db, aisle.id, 'down'))} className="p-1 disabled:opacity-30" aria-label={`Move ${aisle.name} down`}>
                <ArrowDown size={16} />
              </button>
            </li>
          ))}
        </ol>
        <ErrorNote message={aisleAction.error} />
      </Section>

      <Section title="Backup">
        <p className="text-sm text-slate-500">
          Data lives only on this device. Export a backup to move it to another device. Your AI key is never included.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void exportAction.run()} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white">Export backup</button>
          {shareable && (
            <button type="button" onClick={() => void shareAction.run()} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Share backup</button>
          )}
          <label className="cursor-pointer rounded-lg border border-slate-300 px-4 py-2 text-sm">
            Import file
            <input
              type="file"
              accept=".json,application/json,text/plain"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                // Reset so picking the same file again still fires change.
                e.target.value = '';
                if (file) void fileAction.run(file);
              }}
            />
          </label>
          {canUndo && (
            <button type="button" onClick={() => void undoAction.run()} className="rounded-lg border border-amber-400 px-4 py-2 text-sm text-amber-800">Undo last import</button>
          )}
        </div>
        <details>
          <summary className="cursor-pointer text-sm text-slate-600">Or paste a backup</summary>
          <textarea className="mt-2 h-24 w-full rounded border border-slate-200 p-2 font-mono text-xs" value={pasted} onChange={(e) => setPasted(e.target.value)} aria-label="Paste backup" />
          <button type="button" disabled={!pasted.trim()} onClick={() => readImport(pasted)} className="mt-1 rounded border border-slate-300 px-3 py-1 text-sm disabled:opacity-40">Check backup</button>
        </details>
        {summary && pending && (
          <div role="alert" className="space-y-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            <p>
              This backup has {summary.recipes} recipes, {summary.lists} lists, {summary.pantryStaples} pantry staples and{' '}
              {summary.aisleOverrides} aisle choices. Importing replaces everything on this device.
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => void importAction.run(pending)} disabled={importAction.pending} className="rounded bg-amber-700 px-3 py-1 text-white disabled:opacity-50">Replace my data</button>
              <button type="button" onClick={() => setPending(null)} className="rounded border border-amber-300 px-3 py-1">Cancel</button>
            </div>
          </div>
        )}
        <ErrorNote message={exportAction.error ?? shareAction.error ?? fileAction.error ?? importAction.error ?? undoAction.error} />
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

- [ ] **Step 7: Add the changelog line**

Under `### Fixed`, add:

```markdown
- Editing a list item keeps its notes. List and Settings actions show an inline message when they fail, "Copied" clears after a few seconds, Safari backup downloads are no longer cut off, the same backup file can be picked twice, and clearing an aisle name restores it.
```

- [ ] **Step 8: Run tests and typecheck**

Run: `npm test && npm run typecheck`
Expected: 33 files, 396 tests PASS; both `tsc` runs print nothing.

- [ ] **Step 9: Commit**

```bash
git add src/ui/screens/ListScreen.tsx src/ui/components/ListItemRow.tsx src/ui/screens/SettingsScreen.tsx src/test/setup.ts src/ui/screens/ListErrors.test.tsx src/ui/screens/SettingsErrors.test.tsx CHANGELOG.md
git commit -m "fix(ui): inline errors on list and settings, keep notes on edit, small backup and aisle fixes"
```

---

### Task 3: Providers and the LLM client

**Files:**
- Create: `src/services/providers.ts`, `src/services/llm/client.ts`
- Test: `src/services/llm/client.test.ts`

**Interfaces:**
- Consumes: `UserFacingError`.
- Produces: `Provider { id; name; baseUrl; defaultModel; tokenParam: 'max_tokens' | 'max_completion_tokens'; sendTemperature }`, `PROVIDERS`, `getProvider(id): Provider` (unknown ids fall back to DeepSeek), `providerOrigins(): string[]` (used by Plan 5's CSP); `LlmErrorKind` (`'auth' | 'billing' | 'rate_limited' | 'timeout' | 'network' | 'server' | 'bad_response'`), `class LlmError extends UserFacingError { kind }`, `LlmConfig { provider; model; apiKey }`, `ChatJsonRequest { system; user; maxTokens }`, `chatJson(config, request, fetchImpl?, timeoutMs = 45000): Promise<unknown>`.

- [ ] **Step 1: Write the failing test `src/services/llm/client.test.ts`**

```ts
import { describe, expect, it, vi } from 'vitest';
import { getProvider, providerOrigins, PROVIDERS } from '../providers';
import { LlmError, chatJson, type LlmConfig } from './client';

const deepseek: LlmConfig = { provider: getProvider('deepseek'), model: '', apiKey: 'sk-test' };
const request = { system: 'Answer in JSON.', user: 'hi', maxTokens: 100 };

function reply(content: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status }));
}

async function kindOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'none';
  } catch (err) {
    return err instanceof LlmError ? err.kind : 'other';
  }
}

describe('providers', () => {
  it('has four providers and falls back to the first for unknown ids', () => {
    expect(PROVIDERS.map((p) => p.id)).toEqual(['deepseek', 'openrouter', 'openai', 'groq']);
    expect(getProvider('nope').id).toBe('deepseek');
  });

  it('lists origins for the CSP', () => {
    expect(providerOrigins()).toEqual(['https://api.deepseek.com', 'https://openrouter.ai', 'https://api.openai.com', 'https://api.groq.com']);
  });
});

describe('chatJson', () => {
  it('sends an OpenAI-compatible JSON-mode request and parses the reply', async () => {
    const fetchImpl = reply('{"ok":true}');
    expect(await chatJson(deepseek, request, fetchImpl)).toEqual({ ok: true });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.deepseek.com/chat/completions');
    expect(init.headers).toEqual({ Authorization: 'Bearer sk-test', 'Content-Type': 'application/json' });
    expect(JSON.parse(String(init.body))).toEqual({
      model: 'deepseek-flash',
      messages: [{ role: 'system', content: 'Answer in JSON.' }, { role: 'user', content: 'hi' }],
      response_format: { type: 'json_object' },
      max_tokens: 100,
      stream: false,
      temperature: 0.2,
    });
  });

  it('uses the provider token parameter and omits temperature where unsupported', async () => {
    const fetchImpl = reply('{}');
    await chatJson({ provider: getProvider('openai'), model: 'custom-model', apiKey: 'k' }, request, fetchImpl);
    const body = JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.model).toBe('custom-model');
    expect(body.max_completion_tokens).toBe(100);
    expect(body).not.toHaveProperty('max_tokens');
    expect(body).not.toHaveProperty('temperature');
  });

  it('accepts JSON wrapped in a code fence', async () => {
    expect(await chatJson(deepseek, request, reply('```json\n{"a":1}\n```'))).toEqual({ a: 1 });
  });

  it.each([
    [401, 'auth'],
    [403, 'auth'],
    [402, 'billing'],
    [429, 'rate_limited'],
    [500, 'server'],
    [400, 'bad_response'],
  ])('maps HTTP %d to %s', async (status, kind) => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status }));
    expect(await kindOf(chatJson(deepseek, request, fetchImpl))).toBe(kind);
  });

  it.each([
    ['empty content', reply('')],
    ['non-JSON content', reply('Sure! Here you go')],
    ['missing choices', vi.fn(async () => new Response('{}'))],
    ['non-JSON body', vi.fn(async () => new Response('<html>'))],
  ])('treats %s as bad_response', async (_name, fetchImpl) => {
    expect(await kindOf(chatJson(deepseek, request, fetchImpl))).toBe('bad_response');
  });

  it('maps network errors and timeouts', async () => {
    expect(await kindOf(chatJson(deepseek, request, vi.fn(async () => { throw new TypeError('offline'); })))).toBe('network');
    const hang = (_input: string, init: RequestInit) =>
      new Promise<Response>((_r, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
    expect(await kindOf(chatJson(deepseek, request, hang, 10))).toBe('timeout');
  });

  it('never puts the key in error messages', async () => {
    try {
      await chatJson(deepseek, request, vi.fn(async () => new Response('{}', { status: 401 })));
    } catch (err) {
      expect(String((err as Error).message)).not.toContain('sk-test');
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/services/llm/client.test.ts`
Expected: FAIL, `../providers` and `./client` cannot be resolved.

- [ ] **Step 3: Create `src/services/providers.ts`**

```ts
/**
 * OpenAI-compatible providers the app may call from the browser. This list is also the
 * source for the CSP connect-src allowlist (Plan 5), so adding a provider is one entry here.
 * All four answered a browser CORS preflight on 2026-10-01.
 */
export interface Provider {
  id: string;
  name: string;
  /** `${baseUrl}/chat/completions` is the endpoint. */
  baseUrl: string;
  /** Cheap model suited to extraction; the user can type another. Checked 2026-10-01. */
  defaultModel: string;
  /** Newer OpenAI-style APIs reject max_tokens in favor of max_completion_tokens. */
  tokenParam: 'max_tokens' | 'max_completion_tokens';
  /** Reasoning models reject a custom temperature. */
  sendTemperature: boolean;
}

export const PROVIDERS: readonly Provider[] = [
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', defaultModel: 'deepseek-flash', tokenParam: 'max_tokens', sendTemperature: true },
  { id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', defaultModel: 'deepseek/deepseek-v4.1-flash', tokenParam: 'max_tokens', sendTemperature: true },
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-6-luna', tokenParam: 'max_completion_tokens', sendTemperature: false },
  { id: 'groq', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', defaultModel: 'openai/gpt-oss-20b', tokenParam: 'max_completion_tokens', sendTemperature: true },
];

/** Unknown ids (for example from an old backup) fall back to the first provider. */
export function getProvider(id: string): Provider {
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0]!;
}

/** Origins the browser may contact for AI requests (for the CSP connect-src directive). */
export function providerOrigins(): string[] {
  return [...new Set(PROVIDERS.map((p) => new URL(p.baseUrl).origin))];
}
```

- [ ] **Step 4: Create `src/services/llm/client.ts`**

```ts
import { UserFacingError } from '../../app/errors';
import type { Provider } from '../providers';

export type LlmErrorKind = 'auth' | 'billing' | 'rate_limited' | 'timeout' | 'network' | 'server' | 'bad_response';

const MESSAGES: Record<LlmErrorKind, string> = {
  auth: 'The AI provider rejected the key. Check it in Settings.',
  billing: 'The AI provider says the account has no credit left.',
  rate_limited: 'The AI provider is rate limiting requests. Wait a moment and try again.',
  timeout: 'The AI took too long to answer. Try again.',
  network: 'Could not reach the AI provider. Check your connection.',
  server: 'The AI provider had a problem. Try again later.',
  bad_response: "The AI didn't return usable data. Try again, or continue without it.",
};

/** Every failure from an AI call. The message is safe to show; the key is never included. */
export class LlmError extends UserFacingError {
  constructor(readonly kind: LlmErrorKind) {
    super(MESSAGES[kind]);
  }
}

export interface LlmConfig {
  provider: Provider;
  model: string;
  apiKey: string;
}

export interface ChatJsonRequest {
  system: string;
  user: string;
  maxTokens: number;
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

function statusError(status: number): LlmErrorKind {
  if (status === 401 || status === 403) return 'auth';
  if (status === 402) return 'billing';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'server';
  return 'bad_response';
}

/**
 * One non-streaming chat completion in JSON mode. Returns the parsed JSON object from the
 * reply; the caller validates its shape. No retries: one call per user action.
 */
export async function chatJson(
  config: LlmConfig,
  request: ChatJsonRequest,
  fetchImpl: FetchLike = (input, init) => fetch(input, init),
  timeoutMs = 45_000,
): Promise<unknown> {
  const { provider, model, apiKey } = config;
  const body: Record<string, unknown> = {
    model: model || provider.defaultModel,
    messages: [
      { role: 'system', content: request.system },
      { role: 'user', content: request.user },
    ],
    response_format: { type: 'json_object' },
    [provider.tokenParam]: request.maxTokens,
    stream: false,
  };
  if (provider.sendTemperature) body.temperature = 0.2;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetchImpl(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new LlmError(controller.signal.aborted ? 'timeout' : 'network');
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) throw new LlmError(statusError(response.status));

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new LlmError('bad_response');
  }
  const content = (payload as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new LlmError('bad_response');

  const text = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(text);
  } catch {
    throw new LlmError('bad_response');
  }
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npm test && npm run typecheck`
Expected: 34 files, 413 tests PASS; both `tsc` runs print nothing.

- [ ] **Step 6: Commit**

```bash
git add src/services/providers.ts src/services/llm
git commit -m "feat(services): provider list and validated OpenAI-compatible JSON client"
```

---

### Task 4: AI jobs and use cases

**Files:**
- Create: `src/services/llm/jobs.ts`, `src/app/ai.ts`
- Modify: `src/domain/index.ts`
- Test: `src/services/llm/jobs.test.ts`, `src/app/ai.test.ts`

**Interfaces:**
- Consumes: `chatJson`, `LlmError`, `LlmConfig`; `getProvider`; `parseIngredientLine`, `normalizeText`; `getSettings`; `ListExtras`; `UserFacingError`.
- Produces: jobs `CleanedRecipe`, `cleanUpRecipeText(config, text, fetchImpl?)`, `suggestAisles(config, items, aisles, fetchImpl?): Promise<Map<string, string>>`, `SwapsAndTips`, `swapsAndTips(config, itemNames, fetchImpl?)`, `checkConnection(config, fetchImpl?)`; use cases `class AiNotConfiguredError` ("Add an AI key in Settings to use this."), `saveAiKey(db, key)`, `clearAiKey(db)`, `getLlmConfig(db): Promise<LlmConfig | null>`, `hasInventedNumber(line, source): boolean`, `AiDraft { title; servings?; lines: IngredientLine[] }`, `aiCleanUpText(db, text, makeId, fetchImpl?)`, `aiSortUnknownItems(db, listId, fetchImpl?): Promise<number>`, `aiSwapsAndTips(db, listId, now, fetchImpl?): Promise<ListExtras>`, `testAiConnection({ providerId, model, apiKey }, fetchImpl?)`.

- [ ] **Step 1: Export `normalizeText` from the domain**

In `src/domain/index.ts`, replace `export { decodeEntities } from './text';` with:

```ts
export { decodeEntities, normalizeText } from './text';
```

- [ ] **Step 2: Write the failing tests**

`src/services/llm/jobs.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { getProvider } from '../providers';
import { LlmError, type LlmConfig } from './client';
import { checkConnection, cleanUpRecipeText, suggestAisles, swapsAndTips } from './jobs';

const config: LlmConfig = { provider: getProvider('deepseek'), model: '', apiKey: 'k' };

function reply(json: unknown) {
  return vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(json) } }] })));
}

function sentMessages(fetchImpl: ReturnType<typeof reply>) {
  return JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body)).messages as { content: string }[];
}

describe('cleanUpRecipeText', () => {
  it('returns trimmed ingredients, title and servings', async () => {
    const fetchImpl = reply({ title: ' Pancakes ', servings: 4, ingredients: [' 2 cups flour ', '', '3 eggs'] });
    expect(await cleanUpRecipeText(config, 'messy blog text', fetchImpl)).toEqual({ title: 'Pancakes', servings: 4, ingredients: ['2 cups flour', '3 eggs'] });
    expect(sentMessages(fetchImpl)[0]?.content).toContain('Never invent, convert or scale amounts');
  });

  it('accepts null servings and a missing title', async () => {
    expect(await cleanUpRecipeText(config, 't', reply({ servings: null, ingredients: ['1 egg'] }))).toEqual({ title: '', ingredients: ['1 egg'] });
  });

  it.each([
    [{ ingredients: [] }],
    [{ ingredients: 'flour' }],
    [{ ingredients: ['', '  '] }],
    [{ title: 'x' }],
  ])('rejects %j', async (json) => {
    await expect(cleanUpRecipeText(config, 't', reply(json))).rejects.toBeInstanceOf(LlmError);
  });

  it('caps the text it sends', async () => {
    const fetchImpl = reply({ ingredients: ['1 egg'] });
    await cleanUpRecipeText(config, 'x'.repeat(50_000), fetchImpl);
    expect(sentMessages(fetchImpl)[1]?.content).toHaveLength(30_000);
  });
});

describe('suggestAisles', () => {
  const aisles = [{ id: 'produce', name: 'Produce' }, { id: 'other', name: 'Other' }];

  it('keeps only known items and aisles, and drops "other"', async () => {
    const fetchImpl = reply({
      assignments: [
        { item: 'dragon fruit', aisle: 'produce' },
        { item: 'mystery', aisle: 'other' },
        { item: 'invented item', aisle: 'produce' },
        { item: 'gochujang', aisle: 'made-up-aisle' },
      ],
    });
    const result = await suggestAisles(config, ['dragon fruit', 'mystery', 'gochujang'], aisles, fetchImpl);
    expect([...result]).toEqual([['dragon fruit', 'produce']]);
    expect(sentMessages(fetchImpl)[0]?.content).toContain('Use only these aisle ids: produce, other');
  });
});

describe('swapsAndTips', () => {
  it('keeps swaps for listed items and caps counts', async () => {
    const fetchImpl = reply({
      swaps: [{ item: 'Saffron', swap: 'turmeric' }, { item: 'unicorn', swap: 'horse' }],
      tips: ['Freeze leftover herbs in oil.', ' ', 't2', 't3', 't4', 't5', 't6'],
    });
    expect(await swapsAndTips(config, ['saffron', 'rice'], fetchImpl)).toEqual({
      swaps: [{ item: 'Saffron', swap: 'turmeric' }],
      tips: ['Freeze leftover herbs in oil.', 't2', 't3', 't4', 't5'],
    });
  });

  it('accepts missing arrays', async () => {
    expect(await swapsAndTips(config, ['rice'], reply({}))).toEqual({ swaps: [], tips: [] });
  });
});

describe('checkConnection', () => {
  it('passes on {"ok": true} and fails otherwise', async () => {
    await expect(checkConnection(config, reply({ ok: true }))).resolves.toBeUndefined();
    await expect(checkConnection(config, reply({ ok: 'yes' }))).rejects.toBeInstanceOf(LlmError);
  });
});
```

`src/app/ai.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { updateSettings, type CartCraftDb } from '../data/db';
import { createTestDb, sequentialIds } from '../test/db';
import {
  AiNotConfiguredError, aiCleanUpText, aiSortUnknownItems, aiSwapsAndTips, clearAiKey, getLlmConfig,
  hasInventedNumber, saveAiKey, testAiConnection,
} from './ai';
import { addAdhocItem, createList } from './lists';
import { draftLinesFromText, saveRecipe } from './recipes';

function reply(json: unknown) {
  return vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(json) } }] })));
}

async function configured(): Promise<CartCraftDb> {
  const db = createTestDb();
  await saveAiKey(db, ' sk-test ');
  return db;
}

async function listWith(db: CartCraftDb, text: string): Promise<string> {
  const ids = sequentialIds('r');
  const recipeId = await saveRecipe(db, { title: 'Dinner', rawText: text, baseServings: 2, ingredients: draftLinesFromText(text, ids) }, 1, ids);
  return createList(db, [{ recipeId, targetServings: 2 }], 1, ids);
}

describe('AI key and config', () => {
  it('saves, reads and clears the key with the selected provider', async () => {
    const db = await configured();
    await updateSettings(db, { llm: { providerId: 'groq', model: 'custom' } });
    const config = await getLlmConfig(db);
    expect(config?.provider.id).toBe('groq');
    expect(config?.model).toBe('custom');
    expect(config?.apiKey).toBe('sk-test');
    await clearAiKey(db);
    expect(await getLlmConfig(db)).toBeNull();
  });

  it('rejects a blank key', async () => {
    await expect(saveAiKey(createTestDb(), '  ')).rejects.toThrow('Enter a key first.');
  });

  it('every AI action explains how to enable it when no key is saved', async () => {
    const db = createTestDb();
    await expect(aiCleanUpText(db, 'x', sequentialIds())).rejects.toBeInstanceOf(AiNotConfiguredError);
    await expect(aiSortUnknownItems(db, 'l')).rejects.toThrow('Add an AI key in Settings to use this.');
    await expect(aiSwapsAndTips(db, 'l', 1)).rejects.toBeInstanceOf(AiNotConfiguredError);
  });
});

describe('hasInventedNumber', () => {
  it.each([
    ['2 cups flour', 'You need 2 cups flour and eggs', false],
    ['1/2 cup cream', 'Add ½ cup cream', false],
    ['3 eggs', 'Crack the eggs', true],
    ['1 tsp salt', 'salt to taste', true],
    ['salt', 'salt to taste', false],
  ])('%s in %j -> %s', (line, source, expected) => {
    expect(hasInventedNumber(line, source)).toBe(expected);
  });
});

describe('aiCleanUpText', () => {
  it('parses the AI lines and flags numbers missing from the source', async () => {
    const db = await configured();
    const fetchImpl = reply({ title: 'Pancakes', servings: 4, ingredients: ['2 cups flour', '3 eggs'] });
    const draft = await aiCleanUpText(db, 'Grandma used 2 cups flour and some eggs. Serves 4.', sequentialIds('l'), fetchImpl);
    expect(draft.title).toBe('Pancakes');
    expect(draft.servings).toBe(4);
    expect(draft.lines.map((l) => [l.id, l.itemKey, l.needsReview])).toEqual([['l-1', 'flour', false], ['l-2', 'egg', true]]);
  });
});

describe('aiSortUnknownItems', () => {
  it('moves Other items, remembers answers, and never overrides a user choice', async () => {
    const db = await configured();
    const listId = await listWith(db, '1 dragon fruit\n1 jar gochujang\n2 onions');
    await addAdhocItem(db, listId, 'birthday candles', sequentialIds('a'));
    await db.aisleOverrides.put({ itemKey: 'birthday candle', aisleId: 'other', source: 'user' });

    const fetchImpl = reply({
      assignments: [
        { item: 'dragon fruit', aisle: 'produce' },
        { item: 'gochujang', aisle: 'canned' },
        { item: 'birthday candle', aisle: 'household' },
      ],
    });
    expect(await aiSortUnknownItems(db, listId, fetchImpl)).toBe(2);

    const items = Object.fromEntries((await db.lists.get(listId))!.items.map((i) => [i.itemKey, i.aisleId]));
    expect(items).toMatchObject({ 'dragon fruit': 'produce', gochujang: 'canned', onion: 'produce', 'birthday candle': 'other' });
    expect(await db.aisleOverrides.get('dragon fruit')).toEqual({ itemKey: 'dragon fruit', aisleId: 'produce', source: 'llm' });
    expect(await db.aisleOverrides.get('birthday candle')).toEqual({ itemKey: 'birthday candle', aisleId: 'other', source: 'user' });

    const body = JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(JSON.parse(body.messages[1].content).items).toEqual(['dragon fruit', 'gochujang', 'birthday candle']);
  });

  it('does not call the AI when nothing is in Other', async () => {
    const db = await configured();
    const listId = await listWith(db, '2 onions');
    const fetchImpl = reply({ assignments: [] });
    expect(await aiSortUnknownItems(db, listId, fetchImpl)).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('aiSwapsAndTips', () => {
  it('stores swaps and tips on the list', async () => {
    const db = await configured();
    const listId = await listWith(db, '1 pinch saffron\n1 cup rice');
    const extras = await aiSwapsAndTips(db, listId, 99, reply({ swaps: [{ item: 'saffron', swap: 'turmeric' }], tips: ['Freeze leftover rice.'] }));
    expect(extras).toEqual({ swaps: [{ item: 'saffron', swap: 'turmeric' }], tips: ['Freeze leftover rice.'], generatedAt: 99 });
    expect((await db.lists.get(listId))?.extras).toEqual(extras);
  });
});

describe('testAiConnection', () => {
  it('checks the given settings without saving them', async () => {
    const fetchImpl = reply({ ok: true });
    await testAiConnection({ providerId: 'openrouter', model: '', apiKey: 'k' }, fetchImpl);
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toBe('https://openrouter.ai/api/v1/chat/completions');
    await expect(testAiConnection({ providerId: 'deepseek', model: '', apiKey: ' ' })).rejects.toThrow('Enter a key first.');
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run src/services/llm/jobs.test.ts src/app/ai.test.ts`
Expected: FAIL, `./jobs` and `./ai` cannot be resolved.

- [ ] **Step 4: Create `src/services/llm/jobs.ts`**

```ts
import { z } from 'zod';
import { LlmError, chatJson, type LlmConfig } from './client';

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

const MAX_INPUT_CHARS = 30_000;

// --- Clean up messy recipe text -------------------------------------------------------------

export interface CleanedRecipe {
  title: string;
  servings?: number;
  ingredients: string[];
}

const CleanupSchema = z.object({
  title: z.string().max(200).nullish(),
  servings: z.number().positive().max(1000).nullish(),
  ingredients: z.array(z.string().max(300)).min(1).max(200),
});

const CLEANUP_SYSTEM = `You extract the ingredient list from recipe text. Respond with a JSON object only:
{"title": string, "servings": number or null, "ingredients": string[]}
Rules:
- One ingredient per array entry, written the way the source writes it, for example "2 cups flour".
- Copy quantities and units exactly from the source. Never invent, convert or scale amounts.
- Leave out steps, notes, headings, nutrition, prices and anything that is not an ingredient.
- Set servings only if the text says how many servings or people it makes, otherwise null.`;

export async function cleanUpRecipeText(config: LlmConfig, text: string, fetchImpl?: FetchLike): Promise<CleanedRecipe> {
  const raw = await chatJson(config, { system: CLEANUP_SYSTEM, user: text.slice(0, MAX_INPUT_CHARS), maxTokens: 4000 }, fetchImpl);
  const parsed = CleanupSchema.safeParse(raw);
  if (!parsed.success) throw new LlmError('bad_response');
  const ingredients = parsed.data.ingredients.map((s) => s.trim()).filter(Boolean);
  if (ingredients.length === 0) throw new LlmError('bad_response');
  return {
    title: parsed.data.title?.trim() ?? '',
    ingredients,
    ...(parsed.data.servings ? { servings: parsed.data.servings } : {}),
  };
}

// --- Aisle fallback --------------------------------------------------------------------------

const AisleSchema = z.object({
  assignments: z.array(z.object({ item: z.string().max(200), aisle: z.string().max(100) })).max(500),
});

/** Suggests an aisle id for each item. Answers outside `aisles` or for unknown items are dropped. */
export async function suggestAisles(
  config: LlmConfig,
  items: string[],
  aisles: { id: string; name: string }[],
  fetchImpl?: FetchLike,
): Promise<Map<string, string>> {
  const ids = new Set(aisles.map((a) => a.id));
  const system = `You sort grocery items into supermarket aisles. Respond with a JSON object only:
{"assignments": [{"item": string, "aisle": string}]}
Use only these aisle ids: ${[...ids].join(', ')}. Use "other" when unsure. Repeat each item exactly as given.`;
  const raw = await chatJson(config, { system, user: JSON.stringify({ aisles, items }), maxTokens: 2000 }, fetchImpl);
  const parsed = AisleSchema.safeParse(raw);
  if (!parsed.success) throw new LlmError('bad_response');
  const wanted = new Set(items);
  const result = new Map<string, string>();
  for (const { item, aisle } of parsed.data.assignments) {
    if (wanted.has(item) && ids.has(aisle) && aisle !== 'other') result.set(item, aisle);
  }
  return result;
}

// --- Swaps and tips --------------------------------------------------------------------------

export interface SwapsAndTips {
  swaps: { item: string; swap: string }[];
  tips: string[];
}

const ExtrasSchema = z.object({
  swaps: z.array(z.object({ item: z.string().max(200), swap: z.string().max(300) })).max(30).nullish(),
  tips: z.array(z.string().max(400)).max(10).nullish(),
});

const EXTRAS_SYSTEM = `You help someone shop for recipes. Respond with a JSON object only:
{"swaps": [{"item": string, "swap": string}], "tips": string[]}
- swaps: cheaper or easier substitutes for at most 8 items that are niche or expensive. Use item names exactly as given.
- tips: at most 5 short tips for using leftovers or avoiding waste.
Do not mention quantities.`;

export async function swapsAndTips(config: LlmConfig, itemNames: string[], fetchImpl?: FetchLike): Promise<SwapsAndTips> {
  const raw = await chatJson(config, { system: EXTRAS_SYSTEM, user: JSON.stringify({ items: itemNames }), maxTokens: 2000 }, fetchImpl);
  const parsed = ExtrasSchema.safeParse(raw);
  if (!parsed.success) throw new LlmError('bad_response');
  const known = new Set(itemNames.map((n) => n.toLowerCase()));
  return {
    swaps: (parsed.data.swaps ?? []).filter((s) => known.has(s.item.toLowerCase()) && s.swap.trim()).slice(0, 8),
    tips: (parsed.data.tips ?? []).map((t) => t.trim()).filter(Boolean).slice(0, 5),
  };
}

// --- Connection check ------------------------------------------------------------------------

/** Resolves when the provider, model and key work in JSON mode; throws LlmError otherwise. */
export async function checkConnection(config: LlmConfig, fetchImpl?: FetchLike): Promise<void> {
  const raw = await chatJson(config, { system: 'Respond with the JSON object {"ok": true} and nothing else.', user: 'ping', maxTokens: 200 }, fetchImpl);
  if ((raw as { ok?: unknown })?.ok !== true) throw new LlmError('bad_response');
}
```

- [ ] **Step 5: Create `src/app/ai.ts`**

```ts
import { normalizeText, parseIngredientLine, type IngredientLine } from '../domain';
import { getSettings, type CartCraftDb } from '../data/db';
import type { ListExtras } from '../data/types';
import { type LlmConfig } from '../services/llm/client';
import { checkConnection, cleanUpRecipeText, suggestAisles, swapsAndTips } from '../services/llm/jobs';
import { getProvider } from '../services/providers';
import { UserFacingError } from './errors';

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export class AiNotConfiguredError extends UserFacingError {
  constructor() {
    super('Add an AI key in Settings to use this.');
  }
}

export async function saveAiKey(db: CartCraftDb, apiKey: string): Promise<void> {
  const key = apiKey.trim();
  if (!key) throw new UserFacingError('Enter a key first.');
  await db.secrets.put({ id: 'secrets', llmApiKey: key });
}

export async function clearAiKey(db: CartCraftDb): Promise<void> {
  await db.secrets.delete('secrets');
}

/** Provider, model and key, or null when no key is saved. */
export async function getLlmConfig(db: CartCraftDb): Promise<LlmConfig | null> {
  const [settings, secrets] = await Promise.all([getSettings(db), db.secrets.get('secrets')]);
  if (!secrets?.llmApiKey) return null;
  return { provider: getProvider(settings.llm.providerId), model: settings.llm.model, apiKey: secrets.llmApiKey };
}

async function requireConfig(db: CartCraftDb): Promise<LlmConfig> {
  const config = await getLlmConfig(db);
  if (!config) throw new AiNotConfiguredError();
  return config;
}

const NUMBER = /\d+(?:[.,/]\d+)?/g;

/** True when the line contains a number that does not appear anywhere in the source text. */
export function hasInventedNumber(line: string, source: string): boolean {
  const haystack = normalizeText(source);
  return (normalizeText(line).match(NUMBER) ?? []).some((n) => !haystack.includes(n));
}

export interface AiDraft {
  title: string;
  servings?: number;
  lines: IngredientLine[];
}

/**
 * Turns messy text into ingredient lines with the AI, then parses every line with the normal
 * parser. Lines with numbers the source never mentions are flagged for review.
 */
export async function aiCleanUpText(
  db: CartCraftDb,
  text: string,
  makeId: () => string,
  fetchImpl?: FetchLike,
): Promise<AiDraft> {
  const cleaned = await cleanUpRecipeText(await requireConfig(db), text, fetchImpl);
  const lines = cleaned.ingredients.map((raw) => {
    const line = parseIngredientLine(raw, makeId());
    return hasInventedNumber(raw, text) ? { ...line, needsReview: true } : line;
  });
  return { title: cleaned.title, lines, ...(cleaned.servings ? { servings: cleaned.servings } : {}) };
}

/**
 * Asks the AI for aisles of the list's items that sit in Other, applies the answers to the list,
 * and remembers them as "llm" overrides. A user's own aisle choice is never overwritten.
 * Returns how many items moved.
 */
export async function aiSortUnknownItems(db: CartCraftDb, listId: string, fetchImpl?: FetchLike): Promise<number> {
  const config = await requireConfig(db);
  const [list, aisles] = await Promise.all([db.lists.get(listId), db.aisles.orderBy('order').toArray()]);
  if (!list) throw new UserFacingError('List not found.');
  const keys = [...new Set(list.items.filter((i) => i.group === 'aisle' && i.aisleId === 'other' && i.itemKey).map((i) => i.itemKey))];
  if (keys.length === 0) return 0;

  const answers = await suggestAisles(config, keys, aisles.map(({ id, name }) => ({ id, name })), fetchImpl);
  if (answers.size === 0) return 0;

  let moved = 0;
  await db.transaction('rw', db.lists, db.aisleOverrides, async () => {
    const current = await db.lists.get(listId);
    if (!current) return;
    const userChoices = new Set((await db.aisleOverrides.where('itemKey').anyOf([...answers.keys()]).toArray())
      .filter((o) => o.source === 'user')
      .map((o) => o.itemKey));
    const items = current.items.map((item) => {
      const aisleId = answers.get(item.itemKey);
      if (!aisleId || item.aisleId !== 'other' || userChoices.has(item.itemKey)) return item;
      moved += 1;
      return { ...item, aisleId };
    });
    await db.lists.update(listId, { items });
    await db.aisleOverrides.bulkPut(
      [...answers].filter(([key]) => !userChoices.has(key)).map(([itemKey, aisleId]) => ({ itemKey, aisleId, source: 'llm' as const })),
    );
  });
  return moved;
}

/** Asks for swaps and waste tips for the list's items and stores them on the list. */
export async function aiSwapsAndTips(db: CartCraftDb, listId: string, now: number, fetchImpl?: FetchLike): Promise<ListExtras> {
  const config = await requireConfig(db);
  const list = await db.lists.get(listId);
  if (!list) throw new UserFacingError('List not found.');
  const names = [...new Set(list.items.map((i) => i.name))];
  if (names.length === 0) throw new UserFacingError('Add items to the list first.');
  const result = await swapsAndTips(config, names, fetchImpl);
  const extras: ListExtras = { ...result, generatedAt: now };
  await db.lists.update(listId, { extras });
  return extras;
}

/** Checks a provider, model and key without saving them. */
export async function testAiConnection(
  input: { providerId: string; model: string; apiKey: string },
  fetchImpl?: FetchLike,
): Promise<void> {
  if (!input.apiKey.trim()) throw new UserFacingError('Enter a key first.');
  await checkConnection({ provider: getProvider(input.providerId), model: input.model.trim(), apiKey: input.apiKey.trim() }, fetchImpl);
}
```

- [ ] **Step 6: Run tests and typecheck**

Run: `npm test && npm run typecheck`
Expected: 36 files, 437 tests PASS; both `tsc` runs print nothing.

- [ ] **Step 7: Commit**

```bash
git add src/services/llm/jobs.ts src/services/llm/jobs.test.ts src/app/ai.ts src/app/ai.test.ts src/domain/index.ts
git commit -m "feat(app): AI clean-up, aisle sorting, swaps and tips with validation and guard rails"
```

---

### Task 5: AI helper settings

**Files:**
- Create: `src/ui/components/AiSettings.tsx`, `src/ui/screens/SettingsAi.test.tsx`
- Modify: `src/ui/screens/SettingsScreen.tsx`, `CHANGELOG.md`

**Interfaces:**
- Consumes: `saveAiKey`, `clearAiKey`, `testAiConnection`; `PROVIDERS`, `getProvider`; `updateSettings`.
- Produces: `AiSettings()` in a Settings section named "AI helper" (above Backup) with a "Provider" select, a "Model" input (placeholder is the provider default; saved on blur), an "API key" password input with "Save key" (or "Key saved on this device." with "Remove key"), and "Test connection" (uses the typed key, else the saved one; shows "Connection works.").

- [ ] **Step 1: Write the failing test `src/ui/screens/SettingsAi.test.tsx`**

```tsx
// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveAiKey } from '../../app/ai';
import { exportBackup, serializeBackup } from '../../data/backup';
import { getSettings } from '../../data/db';
import { createTestDb } from '../../test/db';
import { renderRoutes } from '../../test/render';
import { SettingsScreen } from './SettingsScreen';

const routes = [{ path: '/settings', element: <SettingsScreen now={() => 1} /> }];

function stubProvider(content: unknown, status = 200) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SettingsScreen: AI helper', () => {
  it('saves provider and model, and saves the key without exporting it', async () => {
    const { user, db } = renderRoutes(routes, '/settings');
    const section = await screen.findByRole('region', { name: 'AI helper' });
    await user.selectOptions(within(section).getByLabelText('Provider'), 'openrouter');
    await waitFor(async () => expect((await getSettings(db)).llm.providerId).toBe('openrouter'));

    const model = within(section).getByLabelText('Model');
    expect(model).toHaveAttribute('placeholder', 'deepseek/deepseek-v4.1-flash');
    await user.type(model, 'qwen/qwen3.7-flash');
    await user.tab();
    await waitFor(async () => expect((await getSettings(db)).llm.model).toBe('qwen/qwen3.7-flash'));

    await user.type(within(section).getByLabelText('API key'), 'sk-secret-123');
    await user.click(within(section).getByRole('button', { name: 'Save key' }));
    expect(await within(section).findByText('Key saved on this device.')).toBeInTheDocument();
    expect((await db.secrets.get('secrets'))?.llmApiKey).toBe('sk-secret-123');
    expect(serializeBackup(await exportBackup(db, 1))).not.toContain('sk-secret-123');
  });

  it('removes a saved key', async () => {
    const db = createTestDb();
    await saveAiKey(db, 'sk-old');
    const { user } = renderRoutes(routes, '/settings', db);
    await user.click(await screen.findByRole('button', { name: 'Remove key' }));
    expect(await screen.findByLabelText('API key')).toBeInTheDocument();
    expect(await db.secrets.get('secrets')).toBeUndefined();
  });

  it('tests the connection with the typed key before saving it', async () => {
    const fetchMock = stubProvider({ ok: true });
    const { user, db } = renderRoutes(routes, '/settings');
    const section = await screen.findByRole('region', { name: 'AI helper' });
    await user.type(within(section).getByLabelText('API key'), 'sk-try');
    await user.click(within(section).getByRole('button', { name: 'Test connection' }));
    expect(await within(section).findByText('Connection works.')).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.deepseek.com/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-try');
    expect(await db.secrets.get('secrets')).toBeUndefined();
  });

  it('explains a rejected key', async () => {
    stubProvider({}, 401);
    const db = createTestDb();
    await saveAiKey(db, 'sk-bad');
    const { user } = renderRoutes(routes, '/settings', db);
    const section = await screen.findByRole('region', { name: 'AI helper' });
    await user.click(await within(section).findByRole('button', { name: 'Test connection' }));
    expect(await within(section).findByRole('alert')).toHaveTextContent('The AI provider rejected the key. Check it in Settings.');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/ui/screens/SettingsAi.test.tsx`
Expected: FAIL, no region named "AI helper".

- [ ] **Step 3: Create `src/ui/components/AiSettings.tsx`**

```tsx
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { clearAiKey, saveAiKey, testAiConnection } from '../../app/ai';
import { updateSettings } from '../../data/db';
import { PROVIDERS, getProvider } from '../../services/providers';
import { useDb } from '../db';
import { useSettings } from '../hooks';
import { useAsyncAction } from '../useAsyncAction';
import { ErrorNote } from './ErrorNote';

/** Provider, model and key for the optional AI helper. The key never leaves this device except to the provider. */
export function AiSettings() {
  const db = useDb();
  const settings = useSettings();
  const hasKey = useLiveQuery(async () => Boolean((await db.secrets.get('secrets'))?.llmApiKey), [db]);
  const provider = getProvider(settings.llm.providerId);
  const [model, setModel] = useState(settings.llm.model);
  const [keyDraft, setKeyDraft] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => setModel(settings.llm.model), [settings.llm.model]);

  const save = useAsyncAction((fn: () => Promise<void>) => fn(), 'Could not save AI settings. Try again.');
  const test = useAsyncAction(async () => {
    setMessage(null);
    const apiKey = keyDraft.trim() || (await db.secrets.get('secrets'))?.llmApiKey || '';
    await testAiConnection({ providerId: provider.id, model, apiKey });
    setMessage('Connection works.');
  }, 'The connection test failed.');

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        Optional. AI can tidy up pasted recipes, sort unknown items into aisles and suggest swaps. Your key stays on this
        device, is sent only to the provider you choose, and is never included in backups.
      </p>
      <label className="flex items-center gap-3 text-sm">
        Provider
        <select
          className="rounded border border-slate-200 px-2 py-1"
          value={provider.id}
          onChange={(e) => void save.run(() => updateSettings(db, { llm: { providerId: e.target.value, model: '' } }))}
        >
          {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-3 text-sm">
        Model
        <input
          className="flex-1 rounded border border-slate-200 px-2 py-1 font-mono text-xs"
          value={model}
          placeholder={provider.defaultModel}
          onChange={(e) => setModel(e.target.value)}
          onBlur={() => model.trim() !== settings.llm.model && void save.run(() => updateSettings(db, { llm: { providerId: provider.id, model: model.trim() } }))}
        />
      </label>
      {hasKey ? (
        <div className="flex items-center gap-3 text-sm">
          <span className="text-emerald-800">Key saved on this device.</span>
          <button type="button" onClick={() => void save.run(() => clearAiKey(db))} className="font-medium text-red-700">Remove key</button>
        </div>
      ) : (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save.run(async () => {
              await saveAiKey(db, keyDraft);
              setKeyDraft('');
            });
          }}
        >
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            className="flex-1 rounded border border-slate-200 px-2 py-1 font-mono text-xs"
            placeholder={`${provider.name} API key`}
            aria-label="API key"
            value={keyDraft}
            onChange={(e) => setKeyDraft(e.target.value)}
          />
          <button type="submit" disabled={!keyDraft.trim()} className="rounded bg-slate-900 px-3 py-1 text-sm text-white disabled:opacity-40">Save key</button>
        </form>
      )}
      <button
        type="button"
        onClick={() => void test.run()}
        disabled={test.pending || (!hasKey && !keyDraft.trim())}
        className="rounded border border-slate-300 px-3 py-1 text-sm disabled:opacity-40"
      >
        {test.pending ? 'Testing...' : 'Test connection'}
      </button>
      <ErrorNote message={save.error ?? test.error} />
      {message && <p role="status" className="text-sm text-emerald-800">{message}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Add the section to `src/ui/screens/SettingsScreen.tsx`**

Add the import next to the `ErrorNote` import:

```tsx
import { AiSettings } from '../components/AiSettings';
```

Insert directly above `<Section title="Backup">`:

```tsx
      <Section title="AI helper">
        <AiSettings />
      </Section>

```

- [ ] **Step 5: Add the changelog line**

Under `### Added`, add:

```markdown
- Optional AI helper in Settings: choose DeepSeek, OpenRouter, OpenAI or Groq, enter your own key (kept on this device, never included in backups) and test the connection.
```

- [ ] **Step 6: Run tests and typecheck**

Run: `npm test && npm run typecheck`
Expected: 37 files, 441 tests PASS; both `tsc` runs print nothing.

- [ ] **Step 7: Commit**

```bash
git add src/ui/components/AiSettings.tsx src/ui/screens/SettingsAi.test.tsx src/ui/screens/SettingsScreen.tsx CHANGELOG.md
git commit -m "feat(ui): AI helper settings with provider, model, key and connection test"
```

---

### Task 6: AI clean-up in the recipe editor

**Files:**
- Modify: `src/ui/screens/RecipeEditorScreen.tsx`, `CHANGELOG.md`
- Create: `src/ui/screens/RecipeEditorAi.test.tsx`

**Interfaces:**
- Consumes: `aiCleanUpText`, `AiDraft`; `fetchPageText`, `PageTextResult`; `IMPORT_MESSAGES`.
- Produces: `RecipeEditorScreen` gains props `fetchText?: (url) => Promise<PageTextResult>` and `cleanUp?: (text) => Promise<AiDraft>` (default `aiCleanUpText(db, text, makeId)`). In paste mode a "Clean up with AI" button sits next to Parse; after a link import fails with `no_recipe_data`, a "Try with AI" button appears when a key is saved.

- [ ] **Step 1: Write the failing test `src/ui/screens/RecipeEditorAi.test.tsx`**

```tsx
// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { parseIngredientLine } from '../../domain';
import { saveAiKey, type AiDraft } from '../../app/ai';
import { LlmError } from '../../services/llm/client';
import type { PageTextResult, UrlImportResult } from '../../services/urlImport';
import { createTestDb, sequentialIds } from '../../test/db';
import { renderRoutes } from '../../test/render';
import { RecipeEditorScreen } from './RecipeEditorScreen';

const URL = 'https://www.example.com/blog/pancakes';

const draft: AiDraft = {
  title: 'Pancakes',
  servings: 4,
  lines: [parseIngredientLine('2 cups flour', 'a'), { ...parseIngredientLine('3 eggs', 'b'), needsReview: true }],
};

async function setup(options: {
  withKey?: boolean;
  cleanUp?: (text: string) => Promise<AiDraft>;
  importRecipe?: (url: string) => Promise<UrlImportResult>;
  fetchText?: (url: string) => Promise<PageTextResult>;
} = {}) {
  const db = createTestDb();
  if (options.withKey ?? true) await saveAiKey(db, 'sk-test');
  const cleanUp = vi.fn(options.cleanUp ?? (async () => draft));
  const view = renderRoutes(
    [{
      path: '/recipes/new',
      element: (
        <RecipeEditorScreen
          makeId={sequentialIds('id')}
          cleanUp={cleanUp}
          importRecipe={options.importRecipe ?? (async () => ({ ok: false, error: 'no_recipe_data' }))}
          fetchText={options.fetchText ?? (async () => ({ ok: true, text: 'page text with 2 cups flour', sourceUrl: URL }))}
        />
      ),
    }],
    '/recipes/new',
    db,
  );
  return { ...view, cleanUp };
}

describe('RecipeEditorScreen: AI', () => {
  it('explains how to enable AI when no key is saved', async () => {
    const { user } = await setup({ withKey: false });
    await user.type(screen.getByLabelText('Ingredients'), 'some messy text');
    expect(await screen.findByRole('button', { name: 'Clean up with AI' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Add an AI key in Settings' })).toHaveAttribute('href', '/settings');
  });

  it('cleans up pasted text into reviewed lines', async () => {
    const { user, cleanUp } = await setup();
    await user.type(screen.getByLabelText('Ingredients'), 'Grandma used 2 cups flour and eggs');
    const button = await screen.findByRole('button', { name: 'Clean up with AI' });
    await vi.waitFor(() => expect(button).toBeEnabled());
    await user.click(button);

    expect(cleanUp).toHaveBeenCalledWith('Grandma used 2 cups flour and eggs');
    expect(await screen.findByText('Review (2 lines)')).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Pancakes');
    expect(screen.getByLabelText('Base servings')).toHaveValue(4);
    expect(screen.getAllByLabelText('Check this line')).toHaveLength(1);
  });

  it('shows the AI error and keeps the text', async () => {
    const { user } = await setup({ cleanUp: async () => { throw new LlmError('bad_response'); } });
    await user.type(screen.getByLabelText('Ingredients'), 'messy');
    const button = await screen.findByRole('button', { name: 'Clean up with AI' });
    await vi.waitFor(() => expect(button).toBeEnabled());
    await user.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent("The AI didn't return usable data.");
    expect(screen.getByLabelText('Ingredients')).toHaveValue('messy');
  });

  it('offers Try with AI when a page has no recipe data', async () => {
    const fetchText = vi.fn(async (): Promise<PageTextResult> => ({ ok: true, text: 'page text with 2 cups flour', sourceUrl: URL }));
    const { user, cleanUp } = await setup({ fetchText });
    await user.type(screen.getByLabelText('Ingredients'), URL);
    await user.click(screen.getByRole('button', { name: 'Import from link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No recipe data found');

    await user.click(await screen.findByRole('button', { name: 'Try with AI' }));
    expect(fetchText).toHaveBeenCalledWith(URL);
    expect(cleanUp).toHaveBeenCalledWith('page text with 2 cups flour');
    expect(await screen.findByText('Review (2 lines)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: URL })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try with AI' })).not.toBeInTheDocument();
  });

  it('does not offer Try with AI without a key', async () => {
    const { user } = await setup({ withKey: false });
    await user.type(screen.getByLabelText('Ingredients'), URL);
    await user.click(screen.getByRole('button', { name: 'Import from link' }));
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/No recipe data found/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try with AI' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/ui/screens/RecipeEditorAi.test.tsx`
Expected: FAIL, no "Clean up with AI" button.

- [ ] **Step 3: Replace `src/ui/screens/RecipeEditorScreen.tsx`**

```tsx
import { useLiveQuery } from 'dexie-react-hooks';
import { Link2, Sparkles } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { IngredientLine } from '../../domain';
import { aiCleanUpText, type AiDraft } from '../../app/ai';
import { newId } from '../../app/ids';
import { deleteRecipe, draftLinesFromText, requestPersistence, saveRecipe } from '../../app/recipes';
import {
  IMPORT_MESSAGES, fetchPageText, importRecipeFromUrl, looksLikeUrl, type PageTextResult, type UrlImportResult,
} from '../../services/urlImport';
import { ErrorNote } from '../components/ErrorNote';
import { ReviewTable } from '../components/ReviewTable';
import { useDb } from '../db';
import { useSettings } from '../hooks';
import { useAsyncAction } from '../useAsyncAction';

interface Props {
  makeId?: () => string;
  now?: () => number;
  importRecipe?: (url: string) => Promise<UrlImportResult>;
  fetchText?: (url: string) => Promise<PageTextResult>;
  /** Defaults to aiCleanUpText with this screen's db and makeId. */
  cleanUp?: (text: string) => Promise<AiDraft>;
}

/**
 * Add (/recipes/new) or edit (/recipes/:id). Paste ingredients or a recipe link, review the
 * parsed lines, set servings, save. A link that cannot be imported switches to paste mode;
 * with an AI key, messy text and pages without recipe data can be cleaned up by AI.
 */
export function RecipeEditorScreen({
  makeId = newId,
  now = Date.now,
  importRecipe = importRecipeFromUrl,
  fetchText = fetchPageText,
  cleanUp,
}: Props) {
  const { id } = useParams();
  const db = useDb();
  const navigate = useNavigate();
  const settings = useSettings();
  const hasAi = useLiveQuery(async () => Boolean((await db.secrets.get('secrets'))?.llmApiKey), [db]) ?? false;
  const runCleanUp = cleanUp ?? ((text: string) => aiCleanUpText(db, text, makeId));

  const [loaded, setLoaded] = useState(id === undefined);
  const [missing, setMissing] = useState(false);
  const [rawText, setRawText] = useState('');
  const [title, setTitle] = useState('');
  const [servings, setServings] = useState<string>('');
  const [servingsGuessed, setServingsGuessed] = useState(false);
  const [lines, setLines] = useState<IngredientLine[] | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | undefined>();
  const [yieldText, setYieldText] = useState<string | undefined>();
  const [importNote, setImportNote] = useState<string | null>(null);
  /** A link whose page had no recipe data; AI can still read its text. */
  const [aiUrl, setAiUrl] = useState<string | null>(null);

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
      } else {
        setMissing(true);
      }
      setLoaded(true);
    });
  }, [db, id]);

  const isLink = looksLikeUrl(rawText);

  const parse = () => {
    setImportNote(null);
    setLines(draftLinesFromText(rawText, makeId));
    if (!servings) setServings(String(settings.defaultServings));
  };

  const applyAiDraft = (draft: AiDraft, text: string) => {
    setTitle((current) => current || draft.title);
    setServings(String(draft.servings ?? (servings || settings.defaultServings)));
    setServingsGuessed(draft.servings === undefined && !servings);
    setRawText(text);
    setLines(draft.lines);
  };

  const cleanUpText = useAsyncAction(async (text: string) => {
    setImportNote(null);
    applyAiDraft(await runCleanUp(text), text);
  }, 'AI clean-up failed. Use Parse ingredients instead.');

  const tryWithAi = useAsyncAction(async (url: string) => {
    setImportNote(null);
    const page = await fetchText(url);
    if (!page.ok) {
      setImportNote(IMPORT_MESSAGES[page.error].message);
      return;
    }
    const draft = await runCleanUp(page.text);
    setSourceUrl(page.sourceUrl);
    setAiUrl(null);
    applyAiDraft(draft, draft.lines.map((l) => l.raw).join('\n'));
  }, 'AI could not read that page. Copy the ingredient list and paste it here.');

  const importLink = useAsyncAction(async (url: string) => {
    setImportNote(null);
    setAiUrl(null);
    const result = await importRecipe(url);
    if (!result.ok) {
      const { message, pasteInstead } = IMPORT_MESSAGES[result.error];
      setImportNote(message);
      if (result.error === 'no_recipe_data') setAiUrl(url.trim());
      if (pasteInstead) {
        setSourceUrl(url.trim());
        setRawText('');
      }
      return;
    }
    const { recipe } = result;
    const text = recipe.ingredients.join('\n');
    setTitle((current) => current || recipe.title);
    setSourceUrl(recipe.sourceUrl);
    setYieldText(recipe.yieldText);
    setServings(String(recipe.servings ?? settings.defaultServings));
    setServingsGuessed(recipe.servings === undefined);
    setRawText(text);
    setLines(draftLinesFromText(text, makeId));
  }, 'Could not import that link. Paste the ingredients instead.');

  const baseServings = Number(servings);
  const canSave = lines !== null && title.trim() !== '' && Number.isFinite(baseServings) && baseServings > 0;

  const save = useAsyncAction(async (ingredients: IngredientLine[]) => {
    const isFirst = (await db.recipes.count()) === 0;
    await saveRecipe(
      db,
      {
        ...(id ? { id } : {}),
        title,
        rawText,
        baseServings,
        ingredients: ingredients.filter((l) => l.raw.trim() !== ''),
        ...(sourceUrl ? { sourceUrl } : {}),
        ...(yieldText ? { yieldText } : {}),
      },
      now(),
      makeId,
    );
    if (isFirst) void requestPersistence(db);
    navigate('/');
  }, 'Could not save the recipe. Try again.');

  const remove = useAsyncAction(async (recipeId: string) => {
    await deleteRecipe(db, recipeId);
    navigate('/');
  }, 'Could not delete the recipe. Try again.');

  const onSave = (e: FormEvent) => {
    e.preventDefault();
    if (canSave && lines) void save.run(lines);
  };

  const onDelete = () => {
    if (id && window.confirm(`Delete "${title}"?`)) void remove.run(id);
  };

  if (!loaded) return null;
  if (missing) {
    return (
      <div className="mx-auto max-w-2xl space-y-3">
        <p className="text-slate-500">Recipe not found.</p>
        <Link to="/" className="text-sm font-medium text-emerald-800">Back to recipes</Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSave} className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">{id ? 'Edit recipe' : 'Add recipe'}</h1>

      <section className="space-y-2">
        <label htmlFor="raw" className="block text-sm font-medium text-slate-700">Ingredients</label>
        <p className="text-xs text-slate-500">Paste the ingredient list, or a link to a recipe page.</p>
        <textarea
          id="raw"
          className="h-40 w-full rounded-xl border border-slate-200 p-3 font-mono text-sm"
          placeholder={'https://www.example.com/recipes/tacos\n\nor\n\n2 cups flour\n3 eggs\nSalt, to taste'}
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
        />
        {isLink ? (
          <button
            type="button"
            onClick={() => void importLink.run(rawText)}
            disabled={importLink.pending}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            <Link2 size={16} /> {importLink.pending ? 'Importing...' : 'Import from link'}
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={parse}
              disabled={!rawText.trim()}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {lines ? 'Parse again' : 'Parse ingredients'}
            </button>
            <button
              type="button"
              onClick={() => void cleanUpText.run(rawText)}
              disabled={!hasAi || !rawText.trim() || cleanUpText.pending}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium disabled:opacity-40"
            >
              <Sparkles size={16} /> {cleanUpText.pending ? 'Cleaning up...' : 'Clean up with AI'}
            </button>
            {!hasAi && (
              <span className="text-xs text-slate-500">
                <Link to="/settings" className="underline">Add an AI key in Settings</Link> to use AI clean-up.
              </span>
            )}
          </div>
        )}
        <ErrorNote message={importNote ?? importLink.error ?? cleanUpText.error ?? tryWithAi.error} />
        {aiUrl && hasAi && (
          <button
            type="button"
            onClick={() => void tryWithAi.run(aiUrl)}
            disabled={tryWithAi.pending}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium disabled:opacity-40"
          >
            <Sparkles size={16} /> {tryWithAi.pending ? 'Reading the page...' : 'Try with AI'}
          </button>
        )}
        {sourceUrl && (
          <p className="truncate text-xs text-slate-500">
            Source:{' '}
            {/^https?:\/\//i.test(sourceUrl) ? (
              <a href={sourceUrl} target="_blank" rel="noreferrer noopener" className="underline">{sourceUrl}</a>
            ) : (
              sourceUrl
            )}
          </p>
        )}
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
                onChange={(e) => {
                  setServings(e.target.value);
                  setServingsGuessed(false);
                }}
              />
            </label>
          </section>
          {servingsGuessed && (
            <p role="status" className="text-sm text-amber-800">
              The page did not say how many servings it makes{yieldText ? ` (it says "${yieldText}")` : ''}. Check base servings.
            </p>
          )}

          <section className="space-y-2">
            <h2 className="text-sm font-medium text-slate-700">Review ({lines.length} lines)</h2>
            <ReviewTable lines={lines} onChange={setLines} unitSystem={settings.unitSystem} makeId={makeId} />
          </section>

          <ErrorNote message={save.error ?? remove.error} />

          <div className="flex items-center gap-3">
            <button type="submit" disabled={!canSave || save.pending} className="rounded-lg bg-emerald-800 px-5 py-2.5 font-medium text-white disabled:opacity-40">
              Save recipe
            </button>
            {id && (
              <button type="button" onClick={onDelete} disabled={remove.pending} className="text-sm font-medium text-red-700">
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

- [ ] **Step 4: Add the changelog line**

Under `### Added`, add:

```markdown
- "Clean up with AI" turns messy pasted recipes into ingredient lines, and "Try with AI" reads pages that have no recipe data. Every AI line goes through the normal review, and numbers that are not in the source are flagged.
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npm test && npm run typecheck`
Expected: 38 files, 446 tests PASS; both `tsc` runs print nothing.

- [ ] **Step 6: Commit**

```bash
git add src/ui/screens/RecipeEditorScreen.tsx src/ui/screens/RecipeEditorAi.test.tsx CHANGELOG.md
git commit -m "feat(ui): AI clean-up and Try with AI in the recipe editor"
```

---

### Task 7: AI on the shopping list

**Files:**
- Modify: `src/ui/screens/ListScreen.tsx`, `CHANGELOG.md`
- Create: `src/ui/screens/ListAi.test.tsx`

**Interfaces:**
- Consumes: `aiSortUnknownItems`, `aiSwapsAndTips`.
- Produces: `ListScreen` gains prop `fetchImpl?` (AI HTTP client, for tests). Buttons "Sort N unknown item(s) with AI" (only when unchecked items sit in Other) and "Add swaps & tips" (then "Refresh swaps & tips"); a region "Swaps & tips" lists the stored suggestions; status "Moved N item(s) into aisles."

- [ ] **Step 1: Write the failing test `src/ui/screens/ListAi.test.tsx`**

```tsx
// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { saveAiKey } from '../../app/ai';
import { createList } from '../../app/lists';
import { draftLinesFromText, saveRecipe } from '../../app/recipes';
import type { CartCraftDb } from '../../data/db';
import { createTestDb, sequentialIds } from '../../test/db';
import { renderRoutes } from '../../test/render';
import { ListScreen } from './ListScreen';

function reply(json: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(json) } }] }), { status }));
}

async function seeded(withKey: boolean): Promise<{ db: CartCraftDb; listId: string }> {
  const db = createTestDb();
  if (withKey) await saveAiKey(db, 'sk-test');
  const ids = sequentialIds('s');
  const text = '1 dragon fruit\n2 onions\n1 pinch saffron';
  const recipeId = await saveRecipe(db, { title: 'Bowl', rawText: text, baseServings: 2, ingredients: draftLinesFromText(text, ids) }, 1, ids);
  const listId = await createList(db, [{ recipeId, targetServings: 2 }], 1, ids);
  return { db, listId };
}

function render(db: CartCraftDb, listId: string, fetchImpl: ReturnType<typeof reply>) {
  return renderRoutes(
    [{ path: '/lists/:id', element: <ListScreen makeId={sequentialIds('n')} now={() => 77} fetchImpl={fetchImpl} /> }],
    `/lists/${listId}`,
    db,
  );
}

describe('ListScreen: AI', () => {
  it('sorts unknown items into aisles', async () => {
    const { db, listId } = await seeded(true);
    const fetchImpl = reply({ assignments: [{ item: 'dragon fruit', aisle: 'produce' }] });
    const { user } = render(db, listId, fetchImpl);

    const button = await screen.findByRole('button', { name: 'Sort 1 unknown item with AI' });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);

    expect(await screen.findByText('Moved 1 item into aisles.')).toBeInTheDocument();
    const produce = screen.getByRole('region', { name: 'Produce' });
    expect(within(produce).getByRole('button', { name: 'Dragon fruit: 1' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /unknown item/ })).not.toBeInTheDocument();
  });

  it('adds swaps and tips', async () => {
    const { db, listId } = await seeded(true);
    const fetchImpl = reply({ swaps: [{ item: 'saffron', swap: 'a pinch of turmeric' }], tips: ['Freeze leftover onion.'] });
    const { user } = render(db, listId, fetchImpl);

    const button = await screen.findByRole('button', { name: 'Add swaps & tips' });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);

    const section = await screen.findByRole('region', { name: 'Swaps & tips' });
    expect(section).toHaveTextContent('saffron: a pinch of turmeric');
    expect(section).toHaveTextContent('Freeze leftover onion.');
    expect(screen.getByRole('button', { name: 'Refresh swaps & tips' })).toBeInTheDocument();
    expect((await db.lists.get(listId))?.extras?.generatedAt).toBe(77);
  });

  it('shows provider errors inline', async () => {
    const { db, listId } = await seeded(true);
    const { user } = render(db, listId, reply({}, 429));
    const button = await screen.findByRole('button', { name: 'Add swaps & tips' });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent('rate limiting');
  });

  it('explains how to enable AI without a key', async () => {
    const { db, listId } = await seeded(false);
    render(db, listId, reply({}));
    expect(await screen.findByRole('button', { name: 'Add swaps & tips' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Sort 1 unknown item with AI' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Add an AI key in Settings' })).toHaveAttribute('href', '/settings');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/ui/screens/ListAi.test.tsx`
Expected: FAIL, no "Sort 1 unknown item with AI" button.

- [ ] **Step 3: Replace `src/ui/screens/ListScreen.tsx`**

```tsx
import { useLiveQuery } from 'dexie-react-hooks';
import { Copy, Pencil, Plus, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import type { ListItem } from '../../domain';
import { aiSortUnknownItems, aiSwapsAndTips } from '../../app/ai';
import { newId } from '../../app/ids';
import {
  addAdhocItem, deleteItem, editItem, moveItemToAisle, renameList, setItemChecked,
} from '../../app/lists';
import { groupListItems, listAsText } from '../../app/listView';
import { ErrorNote } from '../components/ErrorNote';
import { ListItemRow } from '../components/ListItemRow';
import { useDb } from '../db';
import { useAisles, useSettings } from '../hooks';
import { useAsyncAction } from '../useAsyncAction';

interface Props {
  makeId?: () => string;
  now?: () => number;
  undoMs?: number;
  copiedMs?: number;
  /** Override the HTTP client for AI calls (tests). */
  fetchImpl?: (input: string, init: RequestInit) => Promise<Response>;
}

/** Shopping mode for one saved list. */
export function ListScreen({ makeId = newId, now = Date.now, undoMs = 5000, copiedMs = 3000, fetchImpl }: Props) {
  const { id = '' } = useParams();
  const db = useDb();
  const settings = useSettings();
  const aisles = useAisles();
  const list = useLiveQuery(async () => (await db.lists.get(id)) ?? null, [db, id]);
  const hasAi = useLiveQuery(async () => Boolean((await db.secrets.get('secrets'))?.llmApiKey), [db]) ?? false;
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [adhoc, setAdhoc] = useState('');
  const [undo, setUndo] = useState<ListItem | null>(null);
  const [copied, setCopied] = useState(false);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(
    () => () => {
      clearTimeout(undoTimer.current);
      clearTimeout(copiedTimer.current);
    },
    [],
  );

  /** Runs any list change; a failure shows one inline message instead of an unhandled rejection. */
  const act = useAsyncAction((fn: () => Promise<void>) => fn(), 'That change did not save. Try again.');
  const copy = useAsyncAction(async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), copiedMs);
  }, 'Could not copy. Select the list and copy it manually.');

  const sortAction = useAsyncAction(async () => {
    setAiNote(null);
    const moved = await aiSortUnknownItems(db, id, fetchImpl);
    setAiNote(moved === 0 ? 'AI could not place any of those items. Move them yourself from the item menu.' : `Moved ${moved} ${moved === 1 ? 'item' : 'items'} into aisles.`);
  }, 'AI sorting failed. Move items yourself from the item menu.');

  const extrasAction = useAsyncAction(async () => {
    setAiNote(null);
    await aiSwapsAndTips(db, id, now(), fetchImpl);
  }, 'Could not get swaps and tips. Try again.');

  if (list === undefined || aisles === undefined) return null;
  if (list === null) return <p className="text-slate-500">List not found.</p>;

  const view = groupListItems(list.items, aisles);
  const unknownCount = new Set(list.items.filter((i) => !i.checked && i.group === 'aisle' && i.aisleId === 'other').map((i) => i.itemKey)).size;

  const toggle = (item: ListItem) =>
    act.run(async () => {
      const checking = !item.checked;
      await setItemChecked(db, list.id, item.id, checking, now());
      clearTimeout(undoTimer.current);
      if (checking) {
        setUndo(item);
        undoTimer.current = setTimeout(() => setUndo(null), undoMs);
      } else {
        setUndo(null);
      }
    });

  const undoCheck = () =>
    act.run(async () => {
      if (!undo) return;
      await setItemChecked(db, list.id, undo.id, false, now());
      setUndo(null);
    });

  const onAdd = (e: FormEvent) => {
    e.preventDefault();
    if (!adhoc.trim()) return;
    void act.run(async () => {
      await addAdhocItem(db, list.id, adhoc, makeId);
      setAdhoc('');
    });
  };

  const onRename = () => {
    const name = window.prompt('List name', list.name);
    if (name?.trim()) void act.run(() => renameList(db, list.id, name));
  };

  const row = (item: ListItem) => (
    <ListItemRow
      key={item.id}
      item={item}
      aisles={aisles}
      unitSystem={settings.unitSystem}
      onToggle={() => void toggle(item)}
      onEdit={(text) => void act.run(() => editItem(db, list.id, item.id, text))}
      onDelete={() => void act.run(() => deleteItem(db, list.id, item.id))}
      onMove={(aisleId) => void act.run(() => moveItemToAisle(db, list.id, item.id, aisleId))}
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
          <button type="button" onClick={onRename} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Rename list">
            <Pencil size={18} />
          </button>
          <button
            type="button"
            onClick={() => void copy.run(listAsText(list.name, list.items, aisles, settings.unitSystem))}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Copy list as text"
          >
            <Copy size={18} />
          </button>
        </div>
      </div>
      {copied && <p role="status" className="text-sm text-emerald-700">Copied to clipboard</p>}
      <ErrorNote message={act.error ?? copy.error} />

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

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {unknownCount > 0 && (
          <button
            type="button"
            onClick={() => void sortAction.run()}
            disabled={!hasAi || sortAction.pending}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-40"
          >
            <Sparkles size={14} /> {sortAction.pending ? 'Sorting...' : `Sort ${unknownCount} unknown ${unknownCount === 1 ? 'item' : 'items'} with AI`}
          </button>
        )}
        <button
          type="button"
          onClick={() => void extrasAction.run()}
          disabled={!hasAi || extrasAction.pending || list.items.length === 0}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-40"
        >
          <Sparkles size={14} /> {extrasAction.pending ? 'Thinking...' : list.extras ? 'Refresh swaps & tips' : 'Add swaps & tips'}
        </button>
        {!hasAi && (
          <span className="text-xs text-slate-500">
            <Link to="/settings" className="underline">Add an AI key in Settings</Link> to use these.
          </span>
        )}
      </div>
      <ErrorNote message={sortAction.error ?? extrasAction.error} />
      {aiNote && <p role="status" className="text-sm text-slate-700">{aiNote}</p>}

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

      {list.extras && (list.extras.swaps.length > 0 || list.extras.tips.length > 0) && (
        <section aria-label="Swaps & tips" className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <h2 className="text-xs font-semibold uppercase tracking-wide">Swaps & tips (AI suggestions)</h2>
          {list.extras.swaps.length > 0 && (
            <ul className="space-y-1">
              {list.extras.swaps.map((s, i) => (
                <li key={i}>
                  <span className="font-medium">{s.item}</span>: {s.swap}
                </li>
              ))}
            </ul>
          )}
          {list.extras.tips.length > 0 && (
            <ul className="list-disc space-y-1 pl-5">
              {list.extras.tips.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
          )}
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

- [ ] **Step 4: Add the changelog line**

Under `### Added`, add:

```markdown
- Shopping lists can ask AI to sort items left in Other into aisles (remembered for next time, never overriding your own choices) and to suggest swaps and leftover tips.
```

- [ ] **Step 5: Run everything**

Run: `npm test && npm run typecheck && npm run build`
Expected: 39 files, 450 tests PASS; both `tsc` runs print nothing; `vite build` ends with "built in".

- [ ] **Step 6: Live check with a real key (manual)**

Run `npm run dev:api` and `npm run dev` (or `npx vite --port 3111`). In Settings > AI helper, choose DeepSeek, paste a real key, click "Test connection". Expected: "Connection works." Then:
1. Add recipe: paste a messy paragraph that mentions "2 cups flour" and "3 eggs", click "Clean up with AI". Expected: review rows for flour and eggs; any number not in the paragraph is highlighted.
2. Paste a link to a page without recipe data (for example a blog post), click "Import from link", then "Try with AI". Expected: review rows and a Source link.
3. Build a list that contains an unusual item (for example "1 jar gochujang"); click "Sort 1 unknown item with AI". Expected: it moves to an aisle.
4. Click "Add swaps & tips". Expected: a "Swaps & tips" section.
5. Settings > Backup > Export, open the file. Expected: the key does not appear.

If the provider rejects the request format (for example a model that refuses `response_format`), the inline message explains it; try another model in Settings and note the result in the PR.

- [ ] **Step 7: Commit**

```bash
git add src/ui/screens/ListScreen.tsx src/ui/screens/ListAi.test.tsx CHANGELOG.md
git commit -m "feat(ui): AI aisle sorting and swaps and tips on the shopping list"
```

---

## Done when

- `npm test` passes 450 tests in 39 files; `npm run typecheck` and `npm run build` succeed.
- Without a key, every AI button is disabled with a link to Settings, and every other feature works.
- `grep -rn "llmApiKey" src --include=*.ts --include=*.tsx | grep -v test` shows it only in `src/data/types.ts`, `src/app/ai.ts` and `src/ui/components/AiSettings.tsx`, `src/ui/screens/RecipeEditorScreen.tsx`, `src/ui/screens/ListScreen.tsx` (presence checks), never in backup code.
- The Task 7 Step 6 live check passes with at least one provider.

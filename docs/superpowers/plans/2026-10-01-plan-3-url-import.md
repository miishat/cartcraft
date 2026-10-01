# CartCraft Plan 3: URL Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import a recipe by pasting its link: a Cloudflare Pages Function fetches the page safely and returns only the schema.org Recipe data, and the Add recipe screen fills the review table from it, falling back to paste mode when a site blocks the import. Also lands the shared error-handling pattern and the remaining parser fixes.

**Architecture:** All server logic lives in `src/server/` as plain TypeScript with injected dependencies (`fetch`, extractors, rate limiter, clock), so it is unit tested in Node. `functions/api/import.ts` is a thin Cloudflare adapter that supplies `HTMLRewriter`-based streaming extractors; it has its own `tsconfig` with Workers types and is verified with `wrangler pages dev` against real pages. The browser calls it through `src/services/urlImport.ts`, which validates every response with Zod and never throws. UI actions use one shared `useAsyncAction` hook that turns failures into inline messages.

**Tech Stack:** React 19, Vitest 3, Zod 4, Cloudflare Pages Functions (`wrangler` 4, `@cloudflare/workers-types` 5, `HTMLRewriter`).

**Spec:** [2026-10-01-cartcraft-rewrite-design.md](../specs/2026-10-01-cartcraft-rewrite-design.md) sections 6 (Add / Edit recipe) and 7. **Roadmap:** [2026-10-01-roadmap.md](2026-10-01-roadmap.md). **Requires:** Plans 1 and 2 merged (`main` at `eb484f0` or later, 307 passing tests).

## Global Constraints

- `CLAUDE.md`: every user-visible change adds a line under `## [Unreleased]` in `CHANGELOG.md` (Added, Changed, Fixed or Removed) in the same commit. The exact lines are given in each task.
- Layers: `src/server/` may import `src/domain/` only; `src/services/` may import `src/domain/` only; `src/ui/` may import everything below it. `functions/` imports `src/server/` and `src/domain/` only.
- The function returns only parsed JSON (`ImportResponse`), never raw HTML, and sets `Cache-Control: no-store` in code (`_headers` does not apply to Function responses).
- Every fetched URL and every redirect target passes `checkTargetUrl` (http(s), default port, no credentials, no IP literals, no single-label or internal hostnames). At most 3 redirects, 10 s timeout, 2 MB body cap.
- Honest User-Agent; no browser impersonation and no challenge solving. Blocked sites get the paste fallback.
- Rate limiting: the Workers rate-limit binding is not in the list of bindings supported by Pages Functions (checked 2026-10-01 at developers.cloudflare.com/pages/functions/wrangler-configuration), so the function uses the in-memory per-isolate limiter (10 requests per minute per client IP), as spec section 7 allows.
- Do not use em dashes in code comments, docs or UI copy.
- `README.md` was intentionally reset to a title in 0.1.0; this plan does not edit it. Local dev for links: run `npm run dev:api` (builds, then serves the function on port 8788) in a second terminal next to `npm run dev`; Vite proxies `/api` to it.
- Port 3000 may be held by another process on this machine. If `npm run dev` fails to bind, run `npx vite --port 3111` instead; do not stop the other process.
- Run commands from the repo root `C:\Users\misha\cartcraft` in Git Bash. UI test files start with `// @vitest-environment jsdom`.

## Open items from Plan 2 handled here

| Item | Where |
|---|---|
| Screens call use cases without a catch (recipe editor, recipes) | Task 1 |
| `requestPersistence` rejection unhandled | Task 1 |
| Parser gaps from Plan 1 (package before container, bare unit, "or to taste", leading "x2", alternatives with amounts, zero amounts) | Task 2 |

The remaining Plan 2 items (list item edit drops notes, backup duplicate ids and missing Other aisle, Settings and List screen error handling, and the small Settings and List fixes) are handled in Plan 4, which modifies those screens.

## File Structure

| File | Responsibility |
|---|---|
| `src/app/errors.ts` | `UserFacingError`, `messageFor()` |
| `src/ui/useAsyncAction.ts` | async action hook: pending, inline error, never rethrows |
| `src/ui/components/ErrorNote.tsx` | inline `role="alert"` message |
| `src/app/recipes.ts` (modify) | `RecipeValidationError` extends `UserFacingError`; `requestPersistence` never throws |
| `src/ui/screens/RecipesScreen.tsx`, `RecipeEditorScreen.tsx` (modify) | use `useAsyncAction`; editor gains Import from link |
| `src/domain/parse.ts`, `src/domain/format.ts`, `src/domain/index.ts` (modify) | parser gaps, zero amounts, export `decodeEntities` |
| `src/server/urlGuard.ts` | `checkTargetUrl()` |
| `src/server/rateLimit.ts` | `createRateLimiter()` |
| `src/server/limitBytes.ts` | `limitBytes()`, `TooLargeError` |
| `src/server/importRecipe.ts` | `handleImport()`: method, rate limit, validation, redirects, timeout, mapping to `ImportResponse` |
| `functions/api/import.ts` | Pages adapter with HTMLRewriter extractors |
| `functions/tsconfig.json`, `wrangler.jsonc` | Workers typecheck, Pages project config |
| `vite.config.ts`, `package.json`, `.gitignore` (modify) | `/api` proxy, `dev:api` and `typecheck` scripts, ignore `.wrangler` |
| `src/services/urlImport.ts` | `importRecipeFromUrl()`, `fetchPageText()`, `looksLikeUrl()`, `IMPORT_MESSAGES` |

---

### Task 1: Shared error handling for async actions

**Files:**
- Create: `src/app/errors.ts`, `src/app/errors.test.ts`, `src/ui/useAsyncAction.ts`, `src/ui/useAsyncAction.test.tsx`, `src/ui/components/ErrorNote.tsx`
- Modify: `src/app/recipes.ts`, `src/app/recipes.test.ts`, `src/ui/screens/RecipesScreen.tsx`, `src/ui/screens/RecipeEditorScreen.tsx`, `src/ui/screens/RecipeEditorScreen.test.tsx`, `CHANGELOG.md`

**Interfaces:**
- Consumes: existing `saveRecipe`, `deleteRecipe`, `createList`, `requestPersistence`.
- Produces: `class UserFacingError extends Error`; `messageFor(err: unknown, fallback: string): string` (user-facing message as-is, anything else becomes `fallback`); `useAsyncAction<A, R>(fn: (...args: A) => Promise<R>, fallback: string): { run(...args: A): Promise<R | undefined>; pending: boolean; error: string | null; clearError(): void }`; `ErrorNote({ message: string | null; className?: string })`. `RecipeValidationError` now extends `UserFacingError`. `requestPersistence` resolves to `undefined` instead of rejecting when the browser throws. Plan 4 reuses all of these.

- [ ] **Step 1: Write the failing tests**

`src/app/errors.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { UserFacingError, messageFor } from './errors';
import { RecipeValidationError } from './recipes';

describe('messageFor', () => {
  it('shows user-facing messages', () => {
    expect(messageFor(new UserFacingError('Title is required'), 'fallback')).toBe('Title is required');
    expect(messageFor(new RecipeValidationError('Base servings must be a positive number'), 'fallback'))
      .toBe('Base servings must be a positive number');
  });

  it('hides internal errors behind the fallback', () => {
    expect(messageFor(new Error('DatabaseClosedError: internal'), 'Could not save.')).toBe('Could not save.');
    expect(messageFor('boom', 'Could not save.')).toBe('Could not save.');
    expect(messageFor(new UserFacingError(''), 'Could not save.')).toBe('Could not save.');
  });
});
```

`src/ui/useAsyncAction.test.tsx`:

```tsx
// @vitest-environment jsdom
import { act, render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UserFacingError } from '../app/errors';
import { ErrorNote } from './components/ErrorNote';
import { useAsyncAction } from './useAsyncAction';

describe('useAsyncAction', () => {
  it('returns the result and tracks pending', async () => {
    let resolve: (v: number) => void = () => undefined;
    const { result } = renderHook(() => useAsyncAction(() => new Promise<number>((r) => { resolve = r; }), 'failed'));
    let promise: Promise<number | undefined> = Promise.resolve(undefined);
    act(() => { promise = result.current.run(); });
    expect(result.current.pending).toBe(true);
    await act(async () => { resolve(42); expect(await promise).toBe(42); });
    expect(result.current.pending).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('captures errors as messages instead of throwing', async () => {
    const { result } = renderHook(() => useAsyncAction(async (kind: string) => {
      if (kind === 'user') throw new UserFacingError('Title is required');
      throw new Error('internal detail');
    }, 'Could not save.'));
    await act(async () => { expect(await result.current.run('user')).toBeUndefined(); });
    expect(result.current.error).toBe('Title is required');
    await act(async () => { await result.current.run('internal'); });
    expect(result.current.error).toBe('Could not save.');
    act(() => result.current.clearError());
    expect(result.current.error).toBeNull();
  });
});

describe('ErrorNote', () => {
  it('renders an alert only with a message', () => {
    const { rerender } = render(<ErrorNote message={null} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    rerender(<ErrorNote message="Could not save." />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save.');
  });
});
```

In `src/app/recipes.test.ts`, inside `describe('requestPersistence', ...)`, add before the `'does nothing when the API is missing'` test:

```ts
  it('swallows browser errors', async () => {
    const db = createTestDb();
    const storage = { persisted: vi.fn(async () => false), persist: vi.fn(async () => { throw new Error('denied'); }) };
    expect(await requestPersistence(db, storage)).toBeUndefined();
    expect((await getSettings(db)).persistGranted).toBeUndefined();
  });

```

In `src/ui/screens/RecipeEditorScreen.test.tsx`, add before the `'keeps a pending line edit when Save is clicked directly'` test:

```tsx
  it('shows an inline error when delete fails and stays on the page', async () => {
    const db = createTestDb();
    const ids = sequentialIds('r');
    const id = await saveRecipe(db, { title: 'Soup', rawText: '1 onion', baseServings: 2, ingredients: draftLinesFromText('1 onion', ids) }, 1, ids);
    const { user } = renderRoutes(routes(), `/recipes/${id}`, db);
    await screen.findByDisplayValue('Soup');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(db.recipes, 'delete').mockRejectedValueOnce(new Error('disk full'));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not delete the recipe. Try again.');
    expect(screen.getByTestId('location').textContent).toBe(`/recipes/${id}`);
  });

```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/app/errors.test.ts src/ui/useAsyncAction.test.tsx src/app/recipes.test.ts src/ui/screens/RecipeEditorScreen.test.tsx`
Expected: FAIL. `./errors` and `./useAsyncAction` cannot be resolved; "swallows browser errors" rejects with "denied"; the delete test finds no alert (unhandled rejection).

- [ ] **Step 3: Create `src/app/errors.ts`**

```ts
/** An error whose message is written for the user and safe to show as-is. */
export class UserFacingError extends Error {}

/** The message to show for any thrown value: user-facing messages as-is, everything else as `fallback`. */
export function messageFor(err: unknown, fallback: string): string {
  return err instanceof UserFacingError && err.message ? err.message : fallback;
}
```

- [ ] **Step 4: Create `src/ui/useAsyncAction.ts` and `src/ui/components/ErrorNote.tsx`**

```ts
import { useCallback, useRef, useState } from 'react';
import { messageFor } from '../app/errors';

export interface AsyncAction<A extends unknown[], R> {
  /** Runs the action. Resolves to its result, or undefined if it threw (the error is captured, never rethrown). */
  run: (...args: A) => Promise<R | undefined>;
  pending: boolean;
  /** A message safe to show the user, or null. */
  error: string | null;
  clearError: () => void;
}

/**
 * Wraps an async UI action so failures become an inline message instead of an unhandled
 * rejection. `fallback` is shown for errors that are not UserFacingError.
 */
export function useAsyncAction<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  fallback: string,
): AsyncAction<A, R> {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (...args: A): Promise<R | undefined> => {
      setPending(true);
      setError(null);
      try {
        return await fnRef.current(...args);
      } catch (err) {
        setError(messageFor(err, fallback));
        return undefined;
      } finally {
        setPending(false);
      }
    },
    [fallback],
  );

  const clearError = useCallback(() => setError(null), []);
  return { run, pending, error, clearError };
}
```

```tsx
/** Inline error next to the action that failed. Renders nothing without a message. */
export function ErrorNote({ message, className = '' }: { message: string | null; className?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className={`text-sm text-red-700 ${className}`}>
      {message}
    </p>
  );
}
```

- [ ] **Step 5: Replace `src/app/recipes.ts`**

```ts
import { parseIngredientLine, type IngredientLine } from '../domain';
import { updateSettings, type CartCraftDb } from '../data/db';
import type { Recipe } from '../data/types';
import { UserFacingError } from './errors';

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

export class RecipeValidationError extends UserFacingError {}

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
 * result is stored so Settings can show it. Never throws: a missing API or a browser
 * error resolves to undefined.
 */
export async function requestPersistence(
  db: CartCraftDb,
  storage: Pick<StorageManager, 'persist' | 'persisted'> | undefined = globalThis.navigator?.storage,
): Promise<boolean | undefined> {
  if (!storage?.persist) return undefined;
  try {
    const granted = (await storage.persisted?.()) || (await storage.persist());
    await updateSettings(db, { persistGranted: granted });
    return granted;
  } catch {
    return undefined;
  }
}
```

- [ ] **Step 6: Replace `src/ui/screens/RecipesScreen.tsx`**

```tsx
import { useLiveQuery } from 'dexie-react-hooks';
import { CheckCircle2, Circle, Plus, ShoppingCart } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { newId } from '../../app/ids';
import { createList } from '../../app/lists';
import { ErrorNote } from '../components/ErrorNote';
import { ServingsStepper } from '../components/ServingsStepper';
import { useDb } from '../db';
import { useSettings } from '../hooks';
import { useAsyncAction } from '../useAsyncAction';

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
  const build = useAsyncAction(async () => {
    const listId = await createList(
      db,
      [...selected].map(([recipeId, targetServings]) => ({ recipeId, targetServings })),
      now(),
      makeId,
    );
    navigate(`/lists/${listId}`);
  }, 'Could not build the list. Try again.');

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
        <div className="fixed inset-x-0 bottom-20 flex flex-col items-center gap-2 px-4 md:bottom-6">
          <ErrorNote message={build.error} className="rounded-lg bg-red-50 px-3 py-2 shadow" />
          <button
            type="button"
            onClick={() => void build.run()}
            disabled={build.pending}
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

- [ ] **Step 7: Replace `src/ui/screens/RecipeEditorScreen.tsx`**

```tsx
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { IngredientLine } from '../../domain';
import { newId } from '../../app/ids';
import { deleteRecipe, draftLinesFromText, requestPersistence, saveRecipe } from '../../app/recipes';
import { ErrorNote } from '../components/ErrorNote';
import { ReviewTable } from '../components/ReviewTable';
import { useDb } from '../db';
import { useSettings } from '../hooks';
import { useAsyncAction } from '../useAsyncAction';

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
  const [missing, setMissing] = useState(false);
  const [rawText, setRawText] = useState('');
  const [title, setTitle] = useState('');
  const [servings, setServings] = useState<string>('');
  const [lines, setLines] = useState<IngredientLine[] | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | undefined>();
  const [yieldText, setYieldText] = useState<string | undefined>();

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

  const parse = () => {
    setLines(draftLinesFromText(rawText, makeId));
    if (!servings) setServings(String(settings.defaultServings));
  };

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

- [ ] **Step 8: Add the changelog line**

In `CHANGELOG.md`, under `## [Unreleased]`, add:

```markdown
### Fixed
- Saving, deleting and building lists now show an inline message when something goes wrong instead of failing silently.
```

- [ ] **Step 9: Run tests and typecheck**

Run: `npm test && npm run typecheck`
Expected: 25 files, 315 tests PASS; `tsc` prints nothing.

- [ ] **Step 10: Commit**

```bash
git add src/app/errors.ts src/app/errors.test.ts src/app/recipes.ts src/app/recipes.test.ts src/ui/useAsyncAction.ts src/ui/useAsyncAction.test.tsx src/ui/components/ErrorNote.tsx src/ui/screens/RecipesScreen.tsx src/ui/screens/RecipeEditorScreen.tsx src/ui/screens/RecipeEditorScreen.test.tsx CHANGELOG.md
git commit -m "fix(ui): shared async error handling for recipe save, delete and list build"
```

---

### Task 2: Remaining parser gaps

**Files:**
- Modify: `src/domain/parse.ts`, `src/domain/format.ts`, `src/domain/parse.test.ts`, `src/domain/format.test.ts`, `CHANGELOG.md`

**Interfaces:**
- Consumes: nothing new.
- Produces: same signatures. New behavior: "4 oz. can tomato paste" is `{quantity: {min: 1}, unit: 'can', packageSize: {quantity: 4, unit: 'oz'}, item: 'tomato paste'}`; "or to taste" leaves no stray "or"; leading "x2 eggs" is quantity 2; `needsReview` is true for a bare unit ("2 cups"), for alternatives that start with a number, and for a zero amount; `formatAmount` returns `''` for zero amounts and `formatAmounts` skips them.

- [ ] **Step 1: Write the failing tests**

Append to `src/domain/parse.test.ts`:

```ts
describe('parseIngredientLine: gaps closed in Plan 3', () => {
  it('reads "4 oz. can tomato paste" as one 4 oz can', () => {
    const line = parse('4 oz. can tomato paste');
    expect(line.quantity).toEqual({ min: 1 });
    expect(line.unit).toBe('can');
    expect(line.packageSize).toEqual({ quantity: 4, unit: 'oz' });
    expect(line.item).toBe('tomato paste');
    expect(line.needsReview).toBe(false);
  });

  it('does not treat a non-container word after a weight as a package', () => {
    const line = parse('1 lb ground beef');
    expect(line.unit).toBe('lb');
    expect(line.packageSize).toBeUndefined();
    expect(line.item).toBe('ground beef');
  });

  it('flags a bare unit with no item', () => {
    const line = parse('2 cups');
    expect(line.needsReview).toBe(true);
  });

  it('drops "or" before "to taste"', () => {
    for (const raw of ['salt, or to taste', 'salt or to taste']) {
      const line = parse(raw);
      expect(line.item).toBe('salt');
      expect(line.notes).toBe('to taste');
      expect(line.scalable).toBe(false);
    }
  });

  it('reads a leading multiplier like "x2 eggs"', () => {
    const line = parse('x2 eggs');
    expect(line.quantity).toEqual({ min: 2 });
    expect(line.itemKey).toBe('egg');
  });

  it('flags alternatives that carry their own amount', () => {
    const line = parse('1 large egg or 2 egg whites');
    expect(line.alternatives).toEqual(['2 egg whites']);
    expect(line.needsReview).toBe(true);
    expect(parse('1 cup butter or margarine').needsReview).toBe(false);
  });

  it('flags a zero amount', () => {
    expect(parse('0 cups sugar').needsReview).toBe(true);
  });
});
```

Append to `src/domain/format.test.ts`:

```ts
describe('zero amounts', () => {
  it('render as nothing instead of "pinch"', () => {
    expect(formatAmount({ quantity: { min: 0 }, unit: 'cup' }, 'us')).toBe('');
    expect(formatAmount({ quantity: { min: 0 }, unit: 'clove' }, 'us')).toBe('');
    expect(formatAmounts([{ quantity: { min: 0 }, unit: 'cup' }, { quantity: { min: 2 }, unit: 'clove' }], 'us')).toBe('2 cloves');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/domain/parse.test.ts src/domain/format.test.ts`
Expected: FAIL in the new describe blocks only (for example "4 oz. can" has unit `oz`, and the zero cup amount renders "pinch").

- [ ] **Step 3: Replace `src/domain/parse.ts`**

```ts
import { itemKey } from './itemKey';
import { NUM, parseLeadingAmount, toNumber } from './quantity';
import { normalizeText } from './text';
import type { IngredientLine, PackageSize, Quantity, SizeWord, UnitId } from './types';
import { isPackagedUnit, lookupUnit } from './units';

const MAX_LINE_LENGTH = 512;
const NON_SCALABLE_UNITS = new Set<UnitId>(['pinch', 'dash']);

const APPROXIMATE = /^(?:about|approx\.?|approximately|around|roughly|~)\s*/i;
const TO_TASTE = /,?\s*\b(?:or\s+)?(?:to taste|as needed|as required)\b\.?/gi;
const JUICE_OR_ZEST = new RegExp(String.raw`^(juice|zest) of (${NUM}) (.+)$`, 'i');
const TRAILING_TIMES = /\s+x\s?(\d+)$/i;
const LEADING_TIMES = /^x\s?(\d+)\s+/i;
/** "4 oz. can tomato paste": the amount is the package size of one container. */
const SIZE_THEN_CONTAINER = /^((?:fl\.?\s*)?[a-z]+)\.?\s+(\S+)\s+(.+)$/i;
const ARTICLE = /^an?\s+/i;
const FLUID_OUNCE = /^(?:fl\.?\s*oz\.?|fluid\s+ounces?)(?=\s)/i;
const UNIT_WORD = /^[a-zA-Z]+\.?/;
const PACKAGE = new RegExp(
  String.raw`^\(?\s*(${NUM})\s*-?\s*((?:fl\.?\s*)?[a-z]+)\.?\s*\)?\s+(\S+)\s+(.+)$`,
  'i',
);
const OUNCES_AFTER_POUNDS = new RegExp(String.raw`^(${NUM})\s*(?:oz|ounces?)\.?\s+(.+)$`, 'i');
const SIZE = /^(small|medium|large)\b,?\s*/i;

/**
 * Parses one ingredient line. Never throws and never drops text: anything not understood
 * stays in `notes` and sets `needsReview`.
 */
export function parseIngredientLine(raw: string, id: string): IngredientLine {
  const unparsed: IngredientLine = {
    id, raw, item: '', itemKey: '', notes: '', alternatives: [],
    scalable: false, approximate: false, isHeader: false, needsReview: true,
  };
  if (raw.length > MAX_LINE_LENGTH) return { ...unparsed, notes: raw };

  let text = normalizeText(raw);
  if (!text) return unparsed;

  if (text.endsWith(':') && !/^\d/.test(text)) {
    const header = text.slice(0, -1).trim();
    return { ...unparsed, item: header, isHeader: true, needsReview: false };
  }

  const notes: string[] = [];
  const alternatives: string[] = [];

  const approx = APPROXIMATE.exec(text);
  const approximate = approx !== null;
  if (approx) text = text.slice(approx[0].length);

  let toTaste = false;
  text = text.replace(TO_TASTE, () => {
    toTaste = true;
    return '';
  }).trim();

  let quantity: Quantity | undefined;
  let unclearRange = false;
  const juice = JUICE_OR_ZEST.exec(text);
  const juiceQty = juice?.[2] === undefined ? undefined : toNumber(juice[2]);
  if (juice && juiceQty !== undefined) {
    quantity = { min: juiceQty };
    notes.push((juice[1] ?? '').toLowerCase());
    text = juice[3] ?? '';
  } else {
    const lead = parseLeadingAmount(text);
    if (lead.quantity) {
      quantity = lead.quantity;
      text = lead.rest;
      if (lead.dropped) {
        notes.push(lead.dropped);
        unclearRange = true;
      }
    } else {
      const article = ARTICLE.exec(text);
      const afterArticle = article ? text.slice(article[0].length) : '';
      const articleUnit = UNIT_WORD.exec(afterArticle)?.[0];
      const leadingTimes = LEADING_TIMES.exec(text);
      if (article && articleUnit && lookupUnit(articleUnit)) {
        quantity = { min: 1 };
        text = afterArticle;
      } else if (leadingTimes?.[1] !== undefined) {
        quantity = { min: Number(leadingTimes[1]) };
        text = text.slice(leadingTimes[0].length);
      } else {
        const trailing = TRAILING_TIMES.exec(text);
        if (trailing?.[1] !== undefined) {
          quantity = { min: Number(trailing[1]) };
          text = text.slice(0, trailing.index);
        }
      }
    }
  }

  let unit: UnitId | undefined;
  let packageSize: PackageSize | undefined;

  if (quantity) {
    const pkg = PACKAGE.exec(text);
    if (pkg) {
      const sizeQty = toNumber(pkg[1] ?? '');
      const sizeUnit = lookupUnit(pkg[2] ?? '');
      const container = lookupUnit(pkg[3] ?? '');
      if (
        sizeQty !== undefined && sizeUnit && container && isPackagedUnit(container.id) &&
        (sizeUnit.dimension === 'mass' || sizeUnit.dimension === 'volume')
      ) {
        packageSize = { quantity: sizeQty, unit: sizeUnit.id };
        unit = container.id;
        text = pkg[4] ?? '';
      }
    }
    if (!unit && quantity.max === undefined) {
      const sized = SIZE_THEN_CONTAINER.exec(text);
      const sizeUnit = lookupUnit(sized?.[1] ?? '');
      const container = lookupUnit(sized?.[2] ?? '');
      if (
        sized && sizeUnit && container && isPackagedUnit(container.id) &&
        (sizeUnit.dimension === 'mass' || sizeUnit.dimension === 'volume')
      ) {
        packageSize = { quantity: quantity.min, unit: sizeUnit.id };
        quantity = { min: 1 };
        unit = container.id;
        text = sized[3] ?? '';
      }
    }
  }

  if (!unit) {
    const fluid = FLUID_OUNCE.exec(text);
    if (fluid && quantity && text.slice(fluid[0].length).trim()) {
      unit = 'fl oz';
      text = text.slice(fluid[0].length).trim();
    } else {
      const word = UNIT_WORD.exec(text)?.[0] ?? '';
      const def = word ? lookupUnit(word) : undefined;
      const remaining = text.slice(word.length).trim();
      if (def && remaining && (quantity || NON_SCALABLE_UNITS.has(def.id))) {
        unit = def.id;
        text = remaining;
        quantity ??= { min: 1 };
      }
    }
    if (unit) text = text.replace(/^of\s+/i, '');
  }

  if (unit === 'lb' && quantity && quantity.max === undefined) {
    const ounces = OUNCES_AFTER_POUNDS.exec(text);
    const ozQty = ounces?.[1] === undefined ? undefined : toNumber(ounces[1]);
    if (ounces && ozQty !== undefined) {
      quantity = { min: quantity.min * 16 + ozQty };
      unit = 'oz';
      text = ounces[2] ?? '';
    }
  }

  let size: SizeWord | undefined;
  const sizeMatch = SIZE.exec(text);
  if (sizeMatch?.[1] !== undefined) {
    size = sizeMatch[1].toLowerCase() as SizeWord;
    text = text.slice(sizeMatch[0].length);
  }

  text = text
    .replace(/\(([^)]*)\)/g, (_m, inner: string) => {
      const content = inner.trim();
      const alternative = /^or\s+(.+)$/i.exec(content);
      if (alternative?.[1] !== undefined) alternatives.push(alternative[1].trim());
      else if (content) notes.push(content);
      return ' ';
    })
    .replace(/\s+/g, ' ')
    .trim();

  const comma = text.indexOf(',');
  let item = (comma >= 0 ? text.slice(0, comma) : text).trim();
  if (comma >= 0) {
    const rest = text.slice(comma + 1).trim();
    if (rest) notes.push(rest);
  }
  const options = item.split(/\s+or\s+/i);
  if (options.length > 1) {
    item = (options[0] ?? '').trim();
    alternatives.push(...options.slice(1).map((o) => o.trim()));
  }
  if (toTaste) notes.push('to taste');

  const needsReview =
    unclearRange ||
    !item ||
    /\s+and\s+/i.test(item) ||
    notes.some((n) => /^plus\b/i.test(n)) ||
    // "2 cups" with nothing after it: the unit word ended up as the item.
    (unit === undefined && lookupUnit(item) !== undefined) ||
    // "1 large egg or 2 egg whites": the alternative needs its own amount.
    alternatives.some((a) => /^\d/.test(a)) ||
    (quantity !== undefined && quantity.min === 0 && quantity.max === undefined);
  const scalable =
    quantity !== undefined && !toTaste && !(unit !== undefined && NON_SCALABLE_UNITS.has(unit));

  return {
    id,
    raw,
    ...(quantity ? { quantity } : {}),
    ...(unit ? { unit } : {}),
    item,
    itemKey: itemKey(item),
    ...(size ? { size } : {}),
    ...(packageSize ? { packageSize } : {}),
    notes: notes.join(', '),
    alternatives,
    scalable,
    approximate,
    isHeader: false,
    needsReview,
  };
}
```

- [ ] **Step 4: Edit `src/domain/format.ts`**

In `formatAmount`, directly after `const { quantity, unit, packageSize } = amount;` add:

```ts
  if (quantity.min <= 0 && (quantity.max ?? 0) <= 0) return '';
```

Replace the body of `formatAmounts` with:

```ts
  return amounts.map((a) => formatAmount(a, system)).filter(Boolean).join(' + ');
```

- [ ] **Step 5: Add the changelog line**

Under `## [Unreleased]` > `### Fixed`, add:

```markdown
- Ingredient parsing: "4 oz. can tomato paste" is read as one 4 oz can, "or to taste" and leading "x2" are understood, and bare units ("2 cups"), alternatives with their own amount and zero amounts are flagged for review. Zero amounts no longer display as "pinch".
```

- [ ] **Step 6: Run tests and typecheck**

Run: `npm test && npm run typecheck`
Expected: 25 files, 323 tests PASS; `tsc` prints nothing.

- [ ] **Step 7: Commit**

```bash
git add src/domain/parse.ts src/domain/format.ts src/domain/parse.test.ts src/domain/format.test.ts CHANGELOG.md
git commit -m "fix(domain): package-before-container, or to taste, x2, flag bare units, alt amounts and zero amounts"
```

---

### Task 3: URL guard, rate limiter and size limit

**Files:**
- Create: `src/server/urlGuard.ts`, `src/server/rateLimit.ts`, `src/server/limitBytes.ts`
- Test: `src/server/urlGuard.test.ts`, `src/server/rateLimit.test.ts`, `src/server/limitBytes.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type UrlCheck = { ok: true; url: URL } | { ok: false }`, `checkTargetUrl(raw: string): UrlCheck`; `RateLimitOptions { limit; windowMs; maxKeys? }`, `createRateLimiter(options): (key: string, now: number) => boolean`; `class TooLargeError extends Error`, `limitBytes(body: ReadableStream<Uint8Array>, maxBytes: number): ReadableStream<Uint8Array>`.

- [ ] **Step 1: Write the failing tests**

`src/server/urlGuard.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { checkTargetUrl } from './urlGuard';

describe('checkTargetUrl', () => {
  it.each([
    'https://www.example.com/recipes/tacos',
    'http://cooking.example.co.uk/r?id=1',
    'https://example.com:443/default-port-normalized',
  ])('accepts %s', (raw) => {
    expect(checkTargetUrl(raw).ok).toBe(true);
  });

  it.each([
    'http://localhost/',
    'http://127.0.0.1/',
    'http://10.0.0.1/',
    'http://192.168.1.10/',
    'http://169.254.169.254/latest/meta-data',
    'http://2130706433/',
    'http://0x7f.1/',
    'http://[::1]/',
    'http://intranet/',
    'http://printer.local/',
    'http://api.internal/',
    'http://router.home.arpa/',
    'http://example.com:8080/',
    'https://user:pass@example.com/',
    'ftp://example.com/file',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'not a url',
    `https://example.com/${'a'.repeat(3000)}`,
  ])('rejects %s', (raw) => {
    expect(checkTargetUrl(raw).ok).toBe(false);
  });
});
```

`src/server/rateLimit.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createRateLimiter } from './rateLimit';

describe('createRateLimiter', () => {
  it('allows up to the limit per window, per key', () => {
    const allow = createRateLimiter({ limit: 2, windowMs: 1000 });
    expect([allow('a', 0), allow('a', 10), allow('a', 20)]).toEqual([true, true, false]);
    expect(allow('b', 20)).toBe(true);
    expect(allow('a', 1000)).toBe(true);
  });

  it('bounds memory by clearing when full', () => {
    const allow = createRateLimiter({ limit: 1, windowMs: 1000, maxKeys: 2 });
    allow('a', 0);
    allow('b', 0);
    allow('c', 0);
    expect(allow('a', 1)).toBe(true);
  });
});
```

`src/server/limitBytes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { TooLargeError, limitBytes } from './limitBytes';

const bodyOf = (text: string) => new Response(text).body!;

describe('limitBytes', () => {
  it('passes small bodies through unchanged', async () => {
    expect(await new Response(limitBytes(bodyOf('hello'), 10)).text()).toBe('hello');
  });

  it('errors once the limit is exceeded', async () => {
    await expect(new Response(limitBytes(bodyOf('x'.repeat(11)), 10)).text()).rejects.toBeInstanceOf(TooLargeError);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/server`
Expected: FAIL, imports `./urlGuard`, `./rateLimit`, `./limitBytes` cannot be resolved.

- [ ] **Step 3: Implement `src/server/urlGuard.ts`**

```ts
export type UrlCheck = { ok: true; url: URL } | { ok: false };

const MAX_URL_LENGTH = 2048;
const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa', '.lan', '.intranet', '.corp'];

/**
 * Accepts only public http(s) URLs on default ports. Rejects credentials, IP-literal hosts
 * (the URL parser normalizes forms like "2130706433" to dotted IPv4), single-label and
 * internal hostnames. Run it on the first URL and on every redirect target.
 */
export function checkTargetUrl(raw: string): UrlCheck {
  if (raw.length > MAX_URL_LENGTH) return { ok: false };
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false };
  if (url.username || url.password) return { ok: false };
  if (url.port !== '') return { ok: false };

  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!host.includes('.')) return { ok: false };
  if (BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) return { ok: false };
  if (host.startsWith('[') || host.includes(':')) return { ok: false };
  if (/^[\d.]+$/.test(host)) return { ok: false };
  return { ok: true, url };
}
```

- [ ] **Step 4: Implement `src/server/rateLimit.ts`**

```ts
export interface RateLimitOptions {
  limit: number;
  windowMs: number;
  /** Bounds memory; the table is cleared when full. */
  maxKeys?: number;
}

/**
 * Fixed-window limiter kept in memory. In Cloudflare it is per isolate, so it is best effort:
 * it slows down abuse of the free request quota but is not a hard guarantee.
 */
export function createRateLimiter({ limit, windowMs, maxKeys = 10_000 }: RateLimitOptions) {
  const hits = new Map<string, { start: number; count: number }>();
  return (key: string, now: number): boolean => {
    const entry = hits.get(key);
    if (!entry || now - entry.start >= windowMs) {
      if (!entry && hits.size >= maxKeys) hits.clear();
      hits.set(key, { start: now, count: 1 });
      return true;
    }
    entry.count += 1;
    return entry.count <= limit;
  };
}
```

- [ ] **Step 5: Implement `src/server/limitBytes.ts`**

```ts
export class TooLargeError extends Error {
  constructor() {
    super('Response body is too large');
  }
}

/** Passes the stream through and errors with TooLargeError once more than `maxBytes` have been read. */
export function limitBytes(body: ReadableStream<Uint8Array>, maxBytes: number): ReadableStream<Uint8Array> {
  let seen = 0;
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        seen += chunk.byteLength;
        if (seen > maxBytes) {
          controller.error(new TooLargeError());
          return;
        }
        controller.enqueue(chunk);
      },
    }),
  );
}
```

- [ ] **Step 6: Run tests and typecheck**

Run: `npx vitest run src/server && npm run typecheck`
Expected: 3 files, 26 tests PASS (including `http://0x7f.1/` and `http://2130706433/`, which the URL parser normalizes to 127.0.0.1); `tsc` prints nothing.

- [ ] **Step 7: Commit**

```bash
git add src/server
git commit -m "feat(server): URL guard, in-memory rate limiter and response size limit"
```

---

### Task 4: Import handler

**Files:**
- Create: `src/server/importRecipe.ts`
- Test: `src/server/importRecipe.test.ts`

**Interfaces:**
- Consumes: `extractRecipe`, `RecipeDraft` from `src/domain`; `checkTargetUrl`; `TooLargeError`.
- Produces: `ImportError` (`'bad_request' | 'invalid_url' | 'rate_limited' | 'blocked' | 'timeout' | 'too_large' | 'no_recipe_data' | 'fetch_failed'`), `ImportResponse` (`{ ok: true; mode: 'recipe'; recipe: RecipeDraft } | { ok: true; mode: 'text'; text: string; sourceUrl: string } | { ok: false; error: ImportError }`), `ImportDeps { fetch; jsonLdBlocks(response, maxBytes); visibleText(response, maxBytes, maxChars); allow(key, now); now() }`, `ImportLimits`, `IMPORT_LIMITS` (2 MB, 30,000 chars, 3 redirects, 10 s), `handleImport(request: Request, deps: ImportDeps, limits?: ImportLimits): Promise<Response>`. Status codes: 405 non-POST, 429 rate limited, 400 bad body or invalid first URL, 200 otherwise (the body's `ok` says success).

- [ ] **Step 1: Write the failing test `src/server/importRecipe.test.ts`**

```ts
import { describe, expect, it, vi } from 'vitest';
import { IMPORT_LIMITS, handleImport, type ImportDeps, type ImportLimits } from './importRecipe';
import { TooLargeError } from './limitBytes';

const RECIPE_PAGE = `<html><head><script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [{ '@type': 'WebPage' }, { '@type': 'Recipe', name: 'Tacos', recipeIngredient: ['1 lb beef', '8 tortillas'], recipeYield: '4' }],
})}</script></head><body><h1>Tacos</h1><script>var x = 1;</script><p>Brown the beef.</p></body></html>`;

/** Test stand-ins for the HTMLRewriter extractors used in Cloudflare. */
async function naiveJsonLd(response: Response): Promise<string[]> {
  const html = await response.text();
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1] ?? '');
}
async function naiveText(response: Response, _maxBytes: number, maxChars: number): Promise<string> {
  const html = await response.text();
  return html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxChars);
}

function html(body: string, init: ResponseInit = {}): Response {
  return new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, ...init });
}

function deps(fetchImpl: ImportDeps['fetch'], overrides: Partial<ImportDeps> = {}): ImportDeps {
  return { fetch: fetchImpl, jsonLdBlocks: naiveJsonLd, visibleText: naiveText, allow: () => true, now: () => 0, ...overrides };
}

function post(body: unknown): Request {
  return new Request('https://cartcraft.test/api/import', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '203.0.113.9' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function call(request: Request, d: ImportDeps, limits: ImportLimits = IMPORT_LIMITS) {
  const response = await handleImport(request, d, limits);
  return { status: response.status, body: await response.json(), headers: response.headers };
}

describe('handleImport', () => {
  it('returns parsed recipe data from JSON-LD, never HTML', async () => {
    const fetchImpl = vi.fn(async () => html(RECIPE_PAGE));
    const { status, body, headers } = await call(post({ url: 'https://example.com/tacos' }), deps(fetchImpl));
    expect(status).toBe(200);
    expect(body).toEqual({
      ok: true,
      mode: 'recipe',
      recipe: { title: 'Tacos', ingredients: ['1 lb beef', '8 tortillas'], servings: 4, sourceUrl: 'https://example.com/tacos' },
    });
    expect(headers.get('cache-control')).toBe('no-store');
    expect(fetchImpl).toHaveBeenCalledWith('https://example.com/tacos', expect.objectContaining({ redirect: 'manual' }));
  });

  it('returns visible text in text mode', async () => {
    const { body } = await call(post({ url: 'https://example.com/tacos', mode: 'text' }), deps(async () => html(RECIPE_PAGE)));
    expect(body.ok).toBe(true);
    expect(body.mode).toBe('text');
    expect(body.text).toContain('Brown the beef.');
    expect(body.text).not.toContain('var x');
    expect(body.sourceUrl).toBe('https://example.com/tacos');
  });

  it('follows redirects and re-checks each target', async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url === 'https://example.com/old'
        ? new Response(null, { status: 301, headers: { location: '/tacos' } })
        : html(RECIPE_PAGE),
    );
    const { body } = await call(post({ url: 'https://example.com/old' }), deps(fetchImpl));
    expect(body.recipe.sourceUrl).toBe('https://example.com/tacos');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('refuses redirects to private addresses', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest' } }));
    const { body } = await call(post({ url: 'https://example.com/r' }), deps(fetchImpl));
    expect(body).toEqual({ ok: false, error: 'invalid_url' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('stops after too many redirects', async () => {
    let n = 0;
    const fetchImpl = vi.fn(async () => new Response(null, { status: 302, headers: { location: `https://example.com/${++n}` } }));
    const { body } = await call(post({ url: 'https://example.com/0' }), deps(fetchImpl));
    expect(body).toEqual({ ok: false, error: 'fetch_failed' });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it.each([
    [{ url: 'http://localhost/' }, 400, 'invalid_url'],
    [{ url: 42 }, 400, 'invalid_url'],
    ['not json', 400, 'bad_request'],
  ])('rejects bad input %j', async (input, status, error) => {
    const fetchImpl = vi.fn();
    const result = await call(post(input), deps(fetchImpl));
    expect(result.status).toBe(status);
    expect(result.body).toEqual({ ok: false, error });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects non-POST requests', async () => {
    const response = await handleImport(new Request('https://cartcraft.test/api/import'), deps(vi.fn()));
    expect(response.status).toBe(405);
  });

  it('rate limits by client IP', async () => {
    const allow = vi.fn(() => false);
    const result = await call(post({ url: 'https://example.com/t' }), deps(vi.fn(), { allow }));
    expect(result.status).toBe(429);
    expect(result.body).toEqual({ ok: false, error: 'rate_limited' });
    expect(allow).toHaveBeenCalledWith('203.0.113.9', 0);
  });

  it.each([
    [() => html('denied', { status: 403 }), 'blocked'],
    [() => html('challenge', { status: 200, headers: { 'cf-mitigated': 'challenge', 'content-type': 'text/html' } }), 'blocked'],
    [() => html('gone', { status: 404 }), 'fetch_failed'],
    [() => new Response('{}', { headers: { 'content-type': 'application/json' } }), 'no_recipe_data'],
    [() => html('<html><body>No structured data</body></html>'), 'no_recipe_data'],
    [() => html('x', { headers: { 'content-type': 'text/html', 'content-length': String(IMPORT_LIMITS.maxBytes + 1) } }), 'too_large'],
  ])('maps upstream responses to errors (%#)', async (upstream, error) => {
    const { body } = await call(post({ url: 'https://example.com/t' }), deps(async () => upstream()));
    expect(body).toEqual({ ok: false, error });
  });

  it('maps a streamed size overflow to too_large', async () => {
    const jsonLdBlocks = async () => {
      throw new TooLargeError();
    };
    const { body } = await call(post({ url: 'https://example.com/t' }), deps(async () => html(RECIPE_PAGE), { jsonLdBlocks }));
    expect(body).toEqual({ ok: false, error: 'too_large' });
  });

  it('maps a timeout to timeout', async () => {
    const fetchImpl = (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    const { body } = await call(post({ url: 'https://example.com/slow' }), deps(fetchImpl), { ...IMPORT_LIMITS, timeoutMs: 10 });
    expect(body).toEqual({ ok: false, error: 'timeout' });
  });

  it('maps network failures to fetch_failed', async () => {
    const fetchImpl = async (): Promise<Response> => {
      throw new TypeError('network');
    };
    const { body } = await call(post({ url: 'https://example.com/t' }), deps(fetchImpl));
    expect(body).toEqual({ ok: false, error: 'fetch_failed' });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/server/importRecipe.test.ts`
Expected: FAIL, import `./importRecipe` cannot be resolved.

- [ ] **Step 3: Implement `src/server/importRecipe.ts`**

```ts
import { extractRecipe, type RecipeDraft } from '../domain';
import { TooLargeError } from './limitBytes';
import { checkTargetUrl } from './urlGuard';

export type ImportError =
  | 'bad_request'
  | 'invalid_url'
  | 'rate_limited'
  | 'blocked'
  | 'timeout'
  | 'too_large'
  | 'no_recipe_data'
  | 'fetch_failed';

export type ImportResponse =
  | { ok: true; mode: 'recipe'; recipe: RecipeDraft }
  | { ok: true; mode: 'text'; text: string; sourceUrl: string }
  | { ok: false; error: ImportError };

export interface ImportDeps {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  /** Contents of every script[type="application/ld+json"]. Must throw TooLargeError past maxBytes. */
  jsonLdBlocks: (response: Response, maxBytes: number) => Promise<string[]>;
  /** Visible page text without scripts and styles, at most maxChars. Must throw TooLargeError past maxBytes. */
  visibleText: (response: Response, maxBytes: number, maxChars: number) => Promise<string>;
  /** Rate limiter: false means reject. */
  allow: (key: string, now: number) => boolean;
  now: () => number;
}

export interface ImportLimits {
  maxBytes: number;
  maxTextChars: number;
  maxRedirects: number;
  timeoutMs: number;
}

export const IMPORT_LIMITS: ImportLimits = {
  maxBytes: 2 * 1024 * 1024,
  maxTextChars: 30_000,
  maxRedirects: 3,
  timeoutMs: 10_000,
};

const USER_AGENT = 'CartCraft-RecipeImporter/1.0 (personal recipe app; reads schema.org Recipe data)';

function json(body: ImportResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function isBlocked(response: Response): boolean {
  return [401, 403, 429, 503].includes(response.status) || response.headers.get('cf-mitigated') === 'challenge';
}

function isHtml(response: Response): boolean {
  const type = response.headers.get('content-type') ?? '';
  return type === '' || /text\/html|application\/xhtml\+xml/i.test(type);
}

/**
 * POST {url, mode?: "recipe" | "text"}. Fetches a public page with manual, re-validated
 * redirects, a timeout and a size cap, and returns only parsed data, never raw HTML.
 */
export async function handleImport(
  request: Request,
  deps: ImportDeps,
  limits: ImportLimits = IMPORT_LIMITS,
): Promise<Response> {
  if (request.method !== 'POST') return json({ ok: false, error: 'bad_request' }, 405);

  const client = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  if (!deps.allow(client, deps.now())) return json({ ok: false, error: 'rate_limited' }, 429);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'bad_request' }, 400);
  }
  const { url, mode } = (body ?? {}) as { url?: unknown; mode?: unknown };
  if (typeof url !== 'string') return json({ ok: false, error: 'invalid_url' }, 400);
  const first = checkTargetUrl(url);
  if (!first.ok) return json({ ok: false, error: 'invalid_url' }, 400);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), limits.timeoutMs);
  try {
    let target = first.url;
    let response: Response;
    for (let hop = 0; ; hop++) {
      response = await deps.fetch(target.href, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
      });
      const location = response.headers.get('location');
      if (response.status < 300 || response.status >= 400 || !location) break;
      if (hop >= limits.maxRedirects) return json({ ok: false, error: 'fetch_failed' });
      const next = checkTargetUrl(new URL(location, target).href);
      if (!next.ok) return json({ ok: false, error: 'invalid_url' });
      target = next.url;
    }

    if (isBlocked(response)) return json({ ok: false, error: 'blocked' });
    if (!response.ok) return json({ ok: false, error: 'fetch_failed' });
    if (!isHtml(response)) return json({ ok: false, error: 'no_recipe_data' });
    if (Number(response.headers.get('content-length') ?? 0) > limits.maxBytes) {
      return json({ ok: false, error: 'too_large' });
    }

    if (mode === 'text') {
      const text = (await deps.visibleText(response, limits.maxBytes, limits.maxTextChars)).trim();
      if (!text) return json({ ok: false, error: 'no_recipe_data' });
      return json({ ok: true, mode: 'text', text, sourceUrl: target.href });
    }

    const recipe = extractRecipe(await deps.jsonLdBlocks(response, limits.maxBytes), target.href);
    if (!recipe || recipe.ingredients.length === 0) return json({ ok: false, error: 'no_recipe_data' });
    return json({ ok: true, mode: 'recipe', recipe });
  } catch (err) {
    if (err instanceof TooLargeError) return json({ ok: false, error: 'too_large' });
    if (controller.signal.aborted) return json({ ok: false, error: 'timeout' });
    return json({ ok: false, error: 'fetch_failed' });
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run src/server && npm run typecheck`
Expected: 4 files, 45 tests PASS; `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/server/importRecipe.ts src/server/importRecipe.test.ts
git commit -m "feat(server): recipe import handler with safe redirects, timeout and error mapping"
```

---

### Task 5: Cloudflare Pages Function and local dev

**Files:**
- Create: `functions/api/import.ts`, `functions/tsconfig.json`, `wrangler.jsonc`
- Modify: `src/domain/index.ts`, `vite.config.ts`, `package.json`, `package-lock.json`, `.gitignore`

**Interfaces:**
- Consumes: `handleImport`, `limitBytes`, `createRateLimiter`, `decodeEntities`.
- Produces: `POST /api/import` in Pages (and under `wrangler pages dev` on port 8788); `npm run dev:api`; `npm run typecheck` now also checks `functions/`.

This adapter is not unit tested: `@cloudflare/vitest-pool-workers` 0.22 requires Vitest 4 and the project is on Vitest 3. It is verified against real pages in Step 9.

- [ ] **Step 1: Install the Cloudflare tooling**

```bash
npm install -D wrangler@^4.146.0 @cloudflare/workers-types@^5.20261001.1
```

Expected: "added N packages"; `npx wrangler --version` prints 4.146.0 or later.

- [ ] **Step 2: Export `decodeEntities` from the domain**

Append to `src/domain/index.ts`:

```ts
export { decodeEntities } from './text';
```

- [ ] **Step 3: Create `functions/api/import.ts`**

```ts
import { decodeEntities } from '../../src/domain';
import { handleImport } from '../../src/server/importRecipe';
import { limitBytes } from '../../src/server/limitBytes';
import { createRateLimiter } from '../../src/server/rateLimit';

/** 10 imports per minute per client IP, per isolate (best effort; see spec section 7). */
const allow = createRateLimiter({ limit: 10, windowMs: 60_000 });

function limited(response: Response, maxBytes: number): Response {
  return new Response(response.body ? limitBytes(response.body, maxBytes) : null, { headers: response.headers });
}

/** Streams the page and keeps only JSON-LD script contents, joining text chunks per script. */
async function jsonLdBlocks(response: Response, maxBytes: number): Promise<string[]> {
  const blocks: string[] = [];
  let current = '';
  await new HTMLRewriter()
    .on('script[type*="ld+json"]', {
      text(chunk) {
        current += chunk.text;
        if (chunk.lastInTextNode) {
          blocks.push(current);
          current = '';
        }
      },
    })
    .transform(limited(response, maxBytes))
    .arrayBuffer();
  return blocks;
}

const HIDDEN = 'head, script, style, noscript, template, svg, iframe, nav, header, footer, aside, form';
const BLOCK = 'p, li, br, tr, h1, h2, h3, h4, h5, h6, div, section, article';

/** Streams the page and keeps visible text only, with line breaks at block elements. */
async function visibleText(response: Response, maxBytes: number, maxChars: number): Promise<string> {
  let hidden = 0;
  let length = 0;
  const parts: string[] = [];
  await new HTMLRewriter()
    .on(HIDDEN, {
      element(el) {
        hidden += 1;
        el.onEndTag(() => {
          hidden -= 1;
        });
      },
    })
    .on(BLOCK, {
      element() {
        parts.push('\n');
      },
    })
    .onDocument({
      text(chunk) {
        if (hidden === 0 && length < maxChars) {
          parts.push(chunk.text);
          length += chunk.text.length;
        }
      },
    })
    .transform(limited(response, maxBytes))
    .arrayBuffer();
  return decodeEntities(parts.join(''))
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, maxChars);
}

export const onRequest: PagesFunction = ({ request }) =>
  handleImport(request, {
    fetch: (url, init) => fetch(url, init),
    jsonLdBlocks,
    visibleText,
    allow,
    now: Date.now,
  });
```

- [ ] **Step 4: Create `functions/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "noEmit": true
  },
  "include": ["."]
}
```

- [ ] **Step 5: Create `wrangler.jsonc`**

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "cartcraft",
  "pages_build_output_dir": "./dist",
  "compatibility_date": "2026-09-15"
}
```

- [ ] **Step 6: Replace `vite.config.ts`**

```ts
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
    // The recipe import function runs under `npm run dev:api` (wrangler pages dev).
    proxy: { '/api': 'http://localhost:8788' },
  },
  plugins: [react(), tailwindcss()],
});
```

- [ ] **Step 7: Update scripts and ignore Wrangler state**

In `package.json` `scripts`, set `typecheck` and add `dev:api`:

```json
"typecheck": "tsc --noEmit && tsc --noEmit -p functions",
"dev:api": "vite build && wrangler pages dev dist --port 8788"
```

Append to `.gitignore`:

```
# Wrangler local state
.wrangler
```

- [ ] **Step 8: Typecheck both projects and run tests**

Run: `npm run typecheck && npm test`
Expected: both `tsc` runs print nothing; 368 tests PASS.

- [ ] **Step 9: Verify against real pages**

Start the function: `npm run dev:api` (wait for "Ready on http://127.0.0.1:8788"). In a second terminal:

```bash
curl -s -X POST http://localhost:8788/api/import -H 'content-type: application/json' -d '{"url":"https://www.bbcgoodfood.com/recipes/easy-pancakes"}'
```

Expected: `{"ok":true,"mode":"recipe","recipe":{"title":"Easy pancakes","ingredients":["100g plain flour","2 large eggs","300ml milk",...],"yieldText":"Makes 12","sourceUrl":"https://www.bbcgoodfood.com/recipes/easy-pancakes"}}`

```bash
curl -s -X POST http://localhost:8788/api/import -H 'content-type: application/json' -d '{"url":"https://www.bbcgoodfood.com/recipes/easy-pancakes","mode":"text"}' | head -c 400
```

Expected: `{"ok":true,"mode":"text","text":"...Easy pancakes..."` with no menu or footer text and no script contents.

```bash
curl -s -X POST http://localhost:8788/api/import -H 'content-type: application/json' -d '{"url":"http://127.0.0.1:8788/"}'
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8788/api/import
```

Expected: `{"ok":false,"error":"invalid_url"}` then `405`. (Verified 2026-10-01: Budget Bytes, BBC Good Food, Simply Recipes, Allrecipes and NYT Cooking all returned recipes.) Stop the server.

- [ ] **Step 10: Commit**

```bash
git add functions wrangler.jsonc src/domain/index.ts vite.config.ts package.json package-lock.json .gitignore
git commit -m "feat(functions): Cloudflare Pages import function with streaming JSON-LD and text extraction"
```

---

### Task 6: Import from link in the Add recipe screen

**Files:**
- Create: `src/services/urlImport.ts`, `src/services/urlImport.test.ts`, `src/ui/screens/RecipeEditorImport.test.tsx`
- Modify: `src/ui/screens/RecipeEditorScreen.tsx`, `CHANGELOG.md`

**Interfaces:**
- Consumes: `RecipeDraft`; `useAsyncAction`, `ErrorNote`; `draftLinesFromText`.
- Produces: `IMPORT_ERRORS`, `UrlImportError`, `UrlImportResult = { ok: true; recipe: RecipeDraft } | { ok: false; error: UrlImportError }`, `PageTextResult = { ok: true; text: string; sourceUrl: string } | { ok: false; error: UrlImportError }`, `looksLikeUrl(text): boolean`, `importRecipeFromUrl(url, fetchImpl?, timeoutMs?)`, `fetchPageText(url, fetchImpl?, timeoutMs?)` (used by Plan 4's "Try with AI"), `IMPORT_MESSAGES: Record<UrlImportError, { message; pasteInstead }>`; `RecipeEditorScreen` gains prop `importRecipe?: (url) => Promise<UrlImportResult>` and shows "Import from link" when the input is a single http(s) link.

- [ ] **Step 1: Write the failing tests**

`src/services/urlImport.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { fetchPageText, importRecipeFromUrl, looksLikeUrl } from './urlImport';

const respond = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe('looksLikeUrl', () => {
  it.each([
    ['https://example.com/tacos', true],
    ['  http://example.com/a?b=1  ', true],
    ['2 cups flour', false],
    ['https://example.com/a\n2 cups flour', false],
    ['example.com/tacos', false],
  ])('%j -> %s', (text, expected) => {
    expect(looksLikeUrl(text)).toBe(expected);
  });
});

describe('importRecipeFromUrl', () => {
  it('posts the trimmed url and returns the recipe', async () => {
    const fetchImpl = respond({ ok: true, mode: 'recipe', recipe: { title: 'Tacos', ingredients: ['1 lb beef'], servings: 4, sourceUrl: 'https://example.com/t' } });
    const result = await importRecipeFromUrl(' https://example.com/t ', fetchImpl);
    expect(result).toEqual({ ok: true, recipe: { title: 'Tacos', ingredients: ['1 lb beef'], servings: 4, sourceUrl: 'https://example.com/t' } });
    expect(fetchImpl).toHaveBeenCalledWith('/api/import', expect.objectContaining({ method: 'POST', body: JSON.stringify({ url: 'https://example.com/t' }) }));
  });

  it('passes through known errors', async () => {
    expect(await importRecipeFromUrl('https://x.com', respond({ ok: false, error: 'blocked' }))).toEqual({ ok: false, error: 'blocked' });
    expect(await importRecipeFromUrl('https://x.com', respond({ ok: false, error: 'rate_limited' }, 429))).toEqual({ ok: false, error: 'rate_limited' });
  });

  it('treats malformed responses and network errors as fetch_failed', async () => {
    expect(await importRecipeFromUrl('https://x.com', respond({ ok: true, recipe: 'nope' }))).toEqual({ ok: false, error: 'fetch_failed' });
    expect(await importRecipeFromUrl('https://x.com', vi.fn(async () => new Response('<html>', { status: 502 })))).toEqual({ ok: false, error: 'fetch_failed' });
    expect(await importRecipeFromUrl('https://x.com', vi.fn(async () => { throw new TypeError('offline'); }))).toEqual({ ok: false, error: 'fetch_failed' });
  });

  it('times out', async () => {
    const hang = (_input: string, init: RequestInit) =>
      new Promise<Response>((_r, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
    expect(await importRecipeFromUrl('https://x.com', hang, 10)).toEqual({ ok: false, error: 'timeout' });
  });
});

describe('fetchPageText', () => {
  it('asks for text mode and returns the text', async () => {
    const fetchImpl = respond({ ok: true, mode: 'text', text: '2 cups flour', sourceUrl: 'https://x.com/a' });
    expect(await fetchPageText('https://x.com/a', fetchImpl)).toEqual({ ok: true, text: '2 cups flour', sourceUrl: 'https://x.com/a' });
    expect(fetchImpl).toHaveBeenCalledWith('/api/import', expect.objectContaining({ body: JSON.stringify({ url: 'https://x.com/a', mode: 'text' }) }));
  });
});
```

`src/ui/screens/RecipeEditorImport.test.tsx`:

```tsx
// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { UrlImportResult } from '../../services/urlImport';
import { sequentialIds } from '../../test/db';
import { renderRoutes } from '../../test/render';
import { RecipeEditorScreen } from './RecipeEditorScreen';

const URL = 'https://www.example.com/recipes/tacos';

function setup(result: UrlImportResult) {
  const importRecipe = vi.fn(async () => result);
  const view = renderRoutes(
    [{ path: '/recipes/new', element: <RecipeEditorScreen makeId={sequentialIds('id')} now={() => 1000} importRecipe={importRecipe} /> }],
    '/recipes/new',
  );
  return { ...view, importRecipe };
}

describe('RecipeEditorScreen: import from link', () => {
  it('offers Import from link for a pasted URL and fills the review', async () => {
    const { user, db, importRecipe } = setup({
      ok: true,
      recipe: { title: 'Tacos', ingredients: ['1 lb ground beef', '8 tortillas'], servings: 6, sourceUrl: URL },
    });
    await user.type(screen.getByLabelText('Ingredients'), URL);
    expect(screen.queryByRole('button', { name: 'Parse ingredients' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Import from link' }));

    expect(importRecipe).toHaveBeenCalledWith(URL);
    expect(await screen.findByText('Review (2 lines)')).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Tacos');
    expect(screen.getByLabelText('Base servings')).toHaveValue(6);
    expect(screen.getByRole('link', { name: URL })).toHaveAttribute('href', URL);

    await user.click(screen.getByRole('button', { name: 'Save recipe' }));
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/'));
    const [recipe] = await db.recipes.toArray();
    expect(recipe).toMatchObject({ title: 'Tacos', baseServings: 6, sourceUrl: URL, rawText: '1 lb ground beef\n8 tortillas' });
  });

  it('asks the user to check servings when the page has none', async () => {
    const { user } = setup({
      ok: true,
      recipe: { title: 'Pancakes', ingredients: ['100g plain flour'], yieldText: 'Makes 12', sourceUrl: URL },
    });
    await user.type(screen.getByLabelText('Ingredients'), URL);
    await user.click(screen.getByRole('button', { name: 'Import from link' }));
    expect(await screen.findByText(/did not say how many servings/)).toHaveTextContent('it says "Makes 12"');
    expect(screen.getByLabelText('Base servings')).toHaveValue(4);
  });

  it('switches to paste mode when the site blocks the import, keeping the source', async () => {
    const { user } = setup({ ok: false, error: 'blocked' });
    await user.type(screen.getByLabelText('Ingredients'), URL);
    await user.click(screen.getByRole('button', { name: 'Import from link' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('This site blocks automatic imports');
    expect(screen.getByLabelText('Ingredients')).toHaveValue('');
    expect(screen.getByRole('link', { name: URL })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Parse ingredients' })).toBeInTheDocument();
  });

  it('keeps the link when the error is not about the page', async () => {
    const { user } = setup({ ok: false, error: 'rate_limited' });
    await user.type(screen.getByLabelText('Ingredients'), URL);
    await user.click(screen.getByRole('button', { name: 'Import from link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many imports');
    expect(screen.getByLabelText('Ingredients')).toHaveValue(URL);
  });

  it('shows a fallback message when the import throws', async () => {
    const importRecipe = vi.fn(async (): Promise<UrlImportResult> => {
      throw new Error('boom');
    });
    const { user } = renderRoutes(
      [{ path: '/recipes/new', element: <RecipeEditorScreen makeId={sequentialIds('id')} importRecipe={importRecipe} /> }],
      '/recipes/new',
    );
    await user.type(screen.getByLabelText('Ingredients'), URL);
    await user.click(screen.getByRole('button', { name: 'Import from link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not import that link.');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/services src/ui/screens/RecipeEditorImport.test.tsx`
Expected: FAIL, `./urlImport` cannot be resolved.

- [ ] **Step 3: Implement `src/services/urlImport.ts`**

```ts
import { z } from 'zod';
import type { RecipeDraft } from '../domain';

export const IMPORT_ERRORS = [
  'bad_request', 'invalid_url', 'rate_limited', 'blocked', 'timeout', 'too_large', 'no_recipe_data', 'fetch_failed',
] as const;
export type UrlImportError = (typeof IMPORT_ERRORS)[number];

export type UrlImportResult = { ok: true; recipe: RecipeDraft } | { ok: false; error: UrlImportError };
export type PageTextResult = { ok: true; text: string; sourceUrl: string } | { ok: false; error: UrlImportError };

const ErrorSchema = z.object({ ok: z.literal(false), error: z.enum(IMPORT_ERRORS) });
const RecipeSchema = z.object({
  ok: z.literal(true),
  mode: z.literal('recipe'),
  recipe: z.object({
    title: z.string().max(500),
    ingredients: z.array(z.string().max(2000)).max(500),
    servings: z.number().finite().positive().optional(),
    yieldText: z.string().max(500).optional(),
    sourceUrl: z.string().max(2048),
  }),
});
const TextSchema = z.object({ ok: z.literal(true), mode: z.literal('text'), text: z.string(), sourceUrl: z.string().max(2048) });

/** True when the whole input is a single http(s) link. */
export function looksLikeUrl(text: string): boolean {
  return /^https?:\/\/\S+$/i.test(text.trim());
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

async function postImport(body: object, fetchImpl: FetchLike, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl('/api/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return await response.json();
  } catch {
    return { ok: false, error: controller.signal.aborted ? 'timeout' : 'fetch_failed' };
  } finally {
    clearTimeout(timer);
  }
}

/** Asks the import function for the page's schema.org Recipe. Never throws. */
export async function importRecipeFromUrl(
  url: string,
  fetchImpl: FetchLike = (input, init) => fetch(input, init),
  timeoutMs = 20_000,
): Promise<UrlImportResult> {
  const data = await postImport({ url: url.trim() }, fetchImpl, timeoutMs);
  const recipe = RecipeSchema.safeParse(data);
  if (recipe.success) {
    const { title, ingredients, servings, yieldText, sourceUrl } = recipe.data.recipe;
    return {
      ok: true,
      recipe: {
        title,
        ingredients,
        sourceUrl,
        ...(servings !== undefined ? { servings } : {}),
        ...(yieldText !== undefined ? { yieldText } : {}),
      },
    };
  }
  const failure = ErrorSchema.safeParse(data);
  return { ok: false, error: failure.success ? failure.data.error : 'fetch_failed' };
}

/** Asks the import function for the page's visible text (input for the AI clean-up in Plan 4). Never throws. */
export async function fetchPageText(
  url: string,
  fetchImpl: FetchLike = (input, init) => fetch(input, init),
  timeoutMs = 20_000,
): Promise<PageTextResult> {
  const data = await postImport({ url: url.trim(), mode: 'text' }, fetchImpl, timeoutMs);
  const text = TextSchema.safeParse(data);
  if (text.success) return { ok: true, text: text.data.text, sourceUrl: text.data.sourceUrl };
  const failure = ErrorSchema.safeParse(data);
  return { ok: false, error: failure.success ? failure.data.error : 'fetch_failed' };
}

/** What to tell the user, and whether to switch the form to paste mode. */
export const IMPORT_MESSAGES: Record<UrlImportError, { message: string; pasteInstead: boolean }> = {
  blocked: { message: 'This site blocks automatic imports. Open the page, copy the ingredient list and paste it here.', pasteInstead: true },
  no_recipe_data: { message: 'No recipe data found on that page. Copy the ingredient list and paste it here.', pasteInstead: true },
  too_large: { message: 'That page is too large to import. Copy the ingredient list and paste it here.', pasteInstead: true },
  timeout: { message: 'That page took too long to load. Try again, or paste the ingredients instead.', pasteInstead: true },
  fetch_failed: { message: 'Could not reach that page. Check the link, or paste the ingredients instead.', pasteInstead: true },
  bad_request: { message: 'Could not reach that page. Check the link, or paste the ingredients instead.', pasteInstead: true },
  invalid_url: { message: 'That link cannot be imported. Use a public http or https recipe page.', pasteInstead: false },
  rate_limited: { message: 'Too many imports in a row. Wait a minute and try again.', pasteInstead: false },
};
```

- [ ] **Step 4: Replace `src/ui/screens/RecipeEditorScreen.tsx`**

The source link renders as a link only for http(s) URLs, because `sourceUrl` can also come from an imported backup file.

```tsx
import { Link2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { IngredientLine } from '../../domain';
import { newId } from '../../app/ids';
import { deleteRecipe, draftLinesFromText, requestPersistence, saveRecipe } from '../../app/recipes';
import { IMPORT_MESSAGES, importRecipeFromUrl, looksLikeUrl, type UrlImportResult } from '../../services/urlImport';
import { ErrorNote } from '../components/ErrorNote';
import { ReviewTable } from '../components/ReviewTable';
import { useDb } from '../db';
import { useSettings } from '../hooks';
import { useAsyncAction } from '../useAsyncAction';

interface Props {
  makeId?: () => string;
  now?: () => number;
  importRecipe?: (url: string) => Promise<UrlImportResult>;
}

/**
 * Add (/recipes/new) or edit (/recipes/:id). Paste ingredients or a recipe link, review the
 * parsed lines, set servings, save. A link that cannot be imported switches to paste mode.
 */
export function RecipeEditorScreen({ makeId = newId, now = Date.now, importRecipe = importRecipeFromUrl }: Props) {
  const { id } = useParams();
  const db = useDb();
  const navigate = useNavigate();
  const settings = useSettings();

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

  const importLink = useAsyncAction(async (url: string) => {
    setImportNote(null);
    const result = await importRecipe(url);
    if (!result.ok) {
      const { message, pasteInstead } = IMPORT_MESSAGES[result.error];
      setImportNote(message);
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
          <button
            type="button"
            onClick={parse}
            disabled={!rawText.trim()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {lines ? 'Parse again' : 'Parse ingredients'}
          </button>
        )}
        <ErrorNote message={importNote ?? importLink.error} />
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

- [ ] **Step 5: Add the changelog line**

Under `## [Unreleased]`, above `### Fixed`, add:

```markdown
### Added
- Import a recipe from a link: paste a recipe page URL and CartCraft reads the recipe data the site publishes. If a site blocks the import or has no recipe data, the form switches to pasting the ingredients.
```

- [ ] **Step 6: Run everything**

Run: `npm test && npm run typecheck && npm run build`
Expected: 31 files, 383 tests PASS; both `tsc` runs print nothing; `vite build` ends with "built in".

- [ ] **Step 7: Smoke test in the browser**

Terminal 1: `npm run dev:api`. Terminal 2: `npm run dev` (or `npx vite --port 3111` if 3000 is taken). Open `/recipes/new`:
1. Paste `https://www.budgetbytes.com/one-pot-creamy-cajun-chicken-pasta/`. Expected: the button reads "Import from link".
2. Click it. Expected: "Review (17 lines)", title filled, a "Source:" link, no console errors.
3. Paste `https://www.bbcgoodfood.com/recipes/easy-pancakes` into a new Add recipe page and import. Expected: a note that the page did not say how many servings (it says "Makes 12"), and base servings prefilled with the default.
4. Paste `http://localhost/x` and import. Expected: "That link cannot be imported..." and the link stays in the box.

Known limitation (not fixed here): "1 lb boneless, skinless chicken breast" splits at the first comma, so the item is "boneless" with the rest in notes. The review table lets the user fix it.

- [ ] **Step 8: Commit**

```bash
git add src/services src/ui/screens/RecipeEditorScreen.tsx src/ui/screens/RecipeEditorImport.test.tsx CHANGELOG.md
git commit -m "feat(ui): import a recipe from a link with paste fallback"
```

---

## Done when

- `npm test` passes 383 tests in 31 files; `npm run typecheck` (app and functions) and `npm run build` succeed.
- Task 5 Step 9 curl checks and Task 6 Step 7 browser smoke test pass.
- `functions/` and `src/server/` never return HTML: `grep -rn "text/html" src/server/importRecipe.ts` shows it only in the `Accept` request header and the `isHtml` check.

# CartCraft Rewrite: Design Spec

Date: 2026-10-01
Status: Approved design, pending implementation plan
Research inputs: [recipe-data-domain.md](../../research/recipe-data-domain.md), [app-platform.md](../../research/app-platform.md)

## 1. Purpose

CartCraft turns a set of saved recipes into one consolidated, aisle-sorted shopping list that you take into the store on your phone.

The original Google AI Studio version sent everything to Gemini and regex-parsed free-form markdown back into a list. The rewrite makes the core deterministic, local and offline, and uses an LLM only as an optional helper for jobs plain code cannot do well.

### Goals

- Works fully offline with no LLM and no account.
- Same recipes + same servings always produce the same list.
- Runs on desktop and phone as an installed PWA.
- Every number on a shopping list comes from deterministic code, never from an LLM.

### Non-goals (v1)

Sync, accounts, multi-user, nutrition, meal calendar, recipe photos, weight/volume density conversion, recipe instructions/steps, choosing between Cloudflare and Netlify (deferred; see 9.4).

## 2. Settled decisions

| Area | Decision |
|---|---|
| Engine | Hybrid: deterministic core; optional LLM layer |
| LLM jobs | Clean messy pasted text, URL import fallback, on-demand swaps and tips, aisle fallback for unknown items |
| LLM connection | OpenAI-compatible `chat/completions`, called from the browser with a user-entered key. Provider allowlist: DeepSeek (default), OpenRouter, OpenAI, Groq. Key stored per device, never exported. |
| Hosting | Static PWA on Cloudflare Pages, plus one Pages Function for URL import. Host to be compared with Netlify later. |
| Devices | Desktop and phone, each with independent local data. No sync. |
| Data transfer | Manual JSON export/import. Import replaces all data after a confirm, with an automatic snapshot and "Undo last import". |
| Recipe model | Editable, user-reviewed ingredient list + base servings; raw text kept |
| Servings | Per-recipe target servings, prefilled from a global default |
| Units | User setting: US imperial or metric. Incompatible units share one line ("Garlic: 2 cloves + 1 tbsp"). |
| Lists | Editable snapshots kept in history. Recipe edits never change an existing list. |
| Extras | Ad-hoc list items, editable pantry staples, saved list history, remembered aisle corrections |
| Architecture | Pure domain core + thin UI |
| Security | Strict CSP whose `connect-src` is generated from the provider allowlist |
| Stack | React 19, Vite, TypeScript (strict), Tailwind installed via `@tailwindcss/vite`, Dexie, Zod, vite-plugin-pwa, React Router, Vitest, Testing Library, Playwright, Wrangler |

## 3. Architecture

Dependencies point downward only. `domain/` imports nothing from the other layers.

```
src/
  ui/          React screens and components
  app/         Use cases that wire domain + data + services (addRecipe, buildList, importBackup, ...)
  domain/      Pure TypeScript. No React, no I/O, no Date.now(), no randomness passed in implicitly.
  data/        Dexie schema, repositories, backup envelope, Zod schemas, migrations
  services/    llm/ (client, prompts, validators), urlImport.ts (calls /api/import), providers.ts
functions/
  api/import.ts  Cloudflare Pages Function: guarded fetch + HTMLRewriter, then domain JSON-LD mapper
```

Rules:

- `domain/` functions are deterministic. Ids and timestamps are passed in as arguments.
- The JSON-LD-to-recipe mapper lives in `domain/jsonld.ts` and is shared by the Pages Function and the tests.
- Host-specific code is confined to `functions/` behind `fetchAndExtract(url): Promise<ImportResult>`.
- Provider config (`services/providers.ts`) is the single source for both the Settings provider picker and the CSP `connect-src` list, generated into `public/_headers` at build time.
- The old root-level files (`App.tsx`, `components/`, `constants.ts`, `types.ts`, `services/recipeEngine.ts`) are replaced by the `src/` tree.

## 4. Data model

Stored in IndexedDB through Dexie, schema version 1. Quantities are stored unrounded as JS numbers; rounding happens only in display formatting.

### 4.1 Domain types

```ts
type UnitId = string;                 // canonical id from the unit table, e.g. "cup", "tbsp", "g", "clove", "can"
type Dimension = "volume" | "mass" | "count" | "other";

interface Quantity { min: number; max?: number }   // max set for ranges like "2-3"

interface IngredientLine {
  id: string;
  raw: string;                 // original text, never discarded
  quantity?: Quantity;
  unit?: UnitId;
  item: string;                // display name, e.g. "red onion"
  itemKey: string;             // normalized identity, e.g. "red onion"
  size?: "small" | "medium" | "large";
  packageSize?: { quantity: number; unit: UnitId };   // "1 (14 oz) can"
  notes: string;               // prep words, alternatives, anything not understood
  alternatives: string[];      // "or margarine"
  scalable: boolean;           // false for "to taste", "pinch", "dash"
  approximate: boolean;        // "about 2 cups"
  isHeader: boolean;           // "For the sauce:"
  needsReview: boolean;        // parser was unsure ("salt and pepper", "plus 2 tsp zest", leftovers)
}

interface Amount { quantity: Quantity; unit?: UnitId; packageSize?: { quantity: number; unit: UnitId } }

interface ListItem {
  id: string;
  itemKey: string;
  name: string;
  amounts: Amount[];           // one entry per incompatible unit/package group
  aisleId: string;
  group: "aisle" | "pantry";   // pantry = matched a pantry staple
  checked: boolean;
  checkedAt?: number;
  origin: "recipe" | "adhoc";
  fromRecipes: string[];       // recipe titles
  notes: string;
}
```

### 4.2 Tables

| Table | Key | Contents |
|---|---|---|
| `recipes` | `id` | `title`, `sourceUrl?`, `rawText`, `baseServings`, `yieldText?`, `ingredients: IngredientLine[]`, `createdAt`, `updatedAt` |
| `lists` | `id` | `name`, `createdAt`, `sources: {recipeId, title, targetServings}[]`, `items: ListItem[]`, `extras?: {swaps: {item, swap}[], tips: string[], generatedAt}` |
| `pantryStaples` | `itemKey` | items you always have; seeded with salt, black pepper, water, olive oil, vegetable oil |
| `aisles` | `id` | `name`, `order`; seeded defaults (see 5.6) |
| `aisleOverrides` | `itemKey` | `aisleId`, `source: "user" \| "llm"` |
| `settings` | singleton | `unitSystem`, `defaultServings` (4), `llm: {providerId, model}`, `keepScreenOn`, `persistGranted?` |
| `secrets` | singleton | `llmApiKey`. Never read by backup code. |
| `snapshots` | singleton | pre-import copy of all exportable tables, `takenAt` |

## 5. Domain pipeline

All functions below are pure and live in `src/domain/`.

### 5.1 Parse: `parseIngredientLine(raw): IngredientLine`

Pipeline: normalize -> amount -> unit -> package size -> size word -> item/notes split -> flags.

- Normalize: decode HTML entities repeatedly (handles double encoding), unicode fractions to ASCII, strip leading bullets and footnote markers, collapse whitespace. Lines over 512 chars or empty lines are flagged, never thrown.
- Amount: mixed numbers ("1 1/2", "1 and 1/2"), ranges ("2-3", "2 to 3", "1 or 2", "½-¾"), compound weights ("1 lb 2 oz" -> 18 oz), trailing "x2". Comma followed by exactly 3 digits is a thousands separator; otherwise it is a decimal comma. Uses `numeric-quantity` with rounding disabled.
- Unit: alias table. `T`/`Tbsp`/`tbsp.` = tbsp, `t`/`tsp` = tsp. `oz` = mass, `fl oz` = volume. Size words (`small`, `medium`, `large`) are never units. A unit word must be followed by more text to count as a unit ("1 tsp ground cloves": unit tsp, item "ground cloves").
- Package size: "1 (14 oz) can", "2 14-ounce cans" -> `packageSize`.
- Parenthetical conversions such as "1 cup (240 ml) milk" go to notes.
- Item/notes split at the first comma; "or X" and "(or X)" go to `alternatives`.
- "to taste", "pinch", "dash", "as needed" -> `scalable: false`.
- "For the sauce:" style lines -> `isHeader: true`.
- Anything not understood stays in `notes`, and `needsReview` is set. No text is ever lost.

Library decision (spike run 2026-10-01): `parse-ingredient` 3.0.0 failed "1 and 1/2", package sizes, "1 lb 2 oz", "large" (treated as a unit), "a pinch of" and decimal commas, and rounds by default. Amount and unit parsing is implemented in-house on top of `numeric-quantity` with rounding disabled.

### 5.2 Normalize: `itemKey(item): string`

Lowercase, drop leading size, freshness and prep words (fresh, freshly, ripe, whole, small, medium, large, minced, chopped, sliced, grated, shredded, peeled, softened, melted, finely, thinly, roughly, coarsely), singularize the last word (`pluralize`, MIT), apply the built-in alias map (e.g. "scallion" -> "green onion"). "diced" and "crushed" are kept because they name canned products. No fuzzy matching: "red onion", "green onion" and "onion" are different keys. "Juice of 2 lemons" becomes item "lemon" with note "juice".

### 5.3 Scale: `scaleLine(line, base, target): IngredientLine`

Multiply `quantity.min`/`max` by `target / base`. Never scale `packageSize`, numbers inside notes, or lines with `scalable: false`. Base servings are required on save; when a URL import has no yield, the review screen asks (default prefilled from settings, never 1).

### 5.4 Merge: `buildListItems(selections, ctx): ListItem[]`

Input: selected recipes with base and target servings, plus a context of pantry staples, an aisle classifier and an id generator. The unit system is applied only at display time (5.5).

1. Skip header lines. Scale each line.
2. Group by `itemKey`.
3. Inside a group, convert amounts to base units per dimension: volume to mL, mass to g, count stays count. Units of dimension `other` (clove, can, pinch, bunch) are grouped by unit id and, for packaged units, also by package size.
4. Sum each sub-group (`min` and `max` summed separately). Each sub-group becomes one `Amount`.
5. Lines with no quantity contribute no amount; if a group has only quantity-less lines, the item appears with no amount.
6. Items whose key is a pantry staple get `group: "pantry"`.
7. `fromRecipes` lists every contributing recipe title. `notes` concatenates distinct notes.

### 5.5 Display: `formatAmount(amount, unitSystem): string`

- Volume, US: choose the largest of cup, tbsp, tsp where the value is at least 1, snap to the nearest 1/8 or 1/3 ("6 tbsp", "1 1/2 cups"). Values under 1/8 tsp display as "pinch".
- Mass, US: oz under 16 oz, lb at or above, snapped to 1/4.
- Metric: g under 1000 then kg; mL under 1000 then L. At most two decimals for kg/L ("1.25 kg"), whole numbers for g/mL (one decimal under 10).
- Count units and packaged units round up for display ("4.5 eggs" -> "5", "0.5 can" -> "1 can (14 oz)").
- Package sizes read as printed on the label ("28 oz", not "1 3/4 lb") and are converted only when the label uses the other unit system.
- Ranges display as "3-4 cloves".
- Multiple amounts join with " + ".

Unit constants: US cup 236.588 mL, US tbsp 14.787 mL, US tsp 4.929 mL, fl oz 29.574 mL, oz 28.3495 g, lb 453.592 g. Input `cup` is parsed as US cup.

### 5.6 Aisle: `classifyAisle(itemKey, overrides, dictionary): aisleId`

Order: user/LLM override -> built-in dictionary (exact key, then longest matching suffix, e.g. "smoked paprika" -> "paprika", then longest matching prefix, e.g. "chicken thigh" -> "chicken") -> `other`.

Default aisles, in order: Produce, Meat & Seafood, Dairy & Eggs, Bakery, Pantry & Dry Goods, Canned & Jarred, Spices & Oils, Frozen, Beverages, Household, Other.

The built-in dictionary (~300 common ingredients) is written for this project. No data is copied from Mealie, KitchenOwl or Tandoor (AGPL) or Open Tandoor Data (ODbL share-alike).

### 5.7 Yield: `parseYield(value): {servings?: number, yieldText?: string}`

Handles number, "4", "Serves 4-6" (min), arrays like `["4", "4 servings"]` and `["6", "24 cookies"]` (servings 6, yieldText "24 cookies"). Unknown -> `servings` undefined.

### 5.8 JSON-LD: `extractRecipe(jsonLdBlocks: string[], pageUrl): RecipeDraft | null`

Tolerant JSON parse per block (skip blocks that fail). Search arrays, `@graph`, `mainEntity`, and `@type` arrays for `Recipe`. When several match, prefer the one whose `url`/`@id` matches the page URL, else the first. Flatten nested `recipeIngredient` arrays, split single-string ingredient lists on newlines, read `PropertyValue` values, decode HTML entities repeatedly.

## 6. Screens and flows

Navigation: bottom tab bar on mobile (Recipes, Lists, Settings), top bar on desktop. React Router with browser history (Pages serves `index.html` for unknown paths).

| Screen | Behavior |
|---|---|
| Recipes | Search by title. Select recipes for the next list; each selected recipe shows a target servings stepper (prefilled from settings). "Build list (N)" creates a list and opens it. |
| Add / Edit recipe | Input accepts a URL or pasted text. URL -> `/api/import`. Text -> deterministic parse, with optional "Clean up with AI". Both end at the review table: one row per line (quantity, unit, item, notes, flags highlighted), editable, plus title and base servings. Save is disabled until base servings is set. |
| Lists | History, newest first: name (default "Shopping list, Oct 1"), item count, checked count. Delete with confirm. |
| List (shopping mode) | Items grouped by aisle in the user's aisle order, then a "Check pantry" group. Tap the whole row to check; checked items move into a collapsible "In cart" section, with a 5 s undo toast. Add ad-hoc item (parsed with the same parser, classified with the same aisle logic). Edit or delete any item. "Move to aisle" saves a user override for that `itemKey`. "Add swaps & tips" (LLM, on demand). "Keep screen on" toggle (Screen Wake Lock, re-acquired on `visibilitychange`, hidden when unsupported). Copy as plain text. |
| Settings | Unit system, default servings, pantry staples editor, aisle names and order editor, LLM provider/model/key with a "Test connection" button, Backup (Export, Import, Undo last import), storage status (`navigator.storage.persist()` result and usage estimate). |

First run on iOS Safari (not standalone): a dismissible banner explains that iOS keeps Safari and installed-app storage separate and recommends installing before adding recipes.

After the first recipe is saved, the app calls `navigator.storage.persist()` once and records the result in settings.

## 7. URL import function

`POST /api/import` with body `{url}`. Response: `{ok: true, recipe: {title, ingredients: string[], yield, sourceUrl}}` or `{ok: false, error}` where `error` is one of `invalid_url`, `blocked`, `timeout`, `too_large`, `no_recipe_data`, `rate_limited`, `fetch_failed`.

Guards (from research section 4 of app-platform.md):

- Only `http:` and `https:` on default ports. Reject raw IP hosts, `localhost`, and private, loopback and link-local ranges.
- `redirect: "manual"`; follow at most 3 redirects, re-validating each `Location`.
- 10 s total timeout via `AbortController`; stop reading after 2 MB.
- Honest User-Agent identifying CartCraft. No browser impersonation, no challenge solving. HTTP 403/429/503 or a challenge page -> `blocked`.
- Stream the body through `HTMLRewriter`, collecting only `script[type="application/ld+json"]` text (joined until `lastInTextNode`), then call `domain/jsonld.ts`.
- Never return raw HTML.
- Rate limit: Cloudflare rate-limit binding (10 requests/minute per IP) if available to Pages Functions on the free plan; if not, a best-effort in-memory per-IP limiter. Verified during implementation.
- Response headers set in code (`_headers` does not apply to Function responses): `Cache-Control: no-store`, `Content-Type: application/json`.

Client behavior: `blocked`, `fetch_failed` or `timeout` -> switch the form to paste mode with an explanation. `no_recipe_data` -> offer "Try with AI" when an LLM is configured, otherwise paste mode.

"Try with AI" for URLs: the client cannot fetch the page, so the function accepts `{url, mode: "text"}` and returns the page's visible text (scripts and styles stripped, capped at 30,000 chars) for the LLM clean-up job. Same guards apply.

## 8. LLM layer

- Plain `fetch` to `{baseUrl}/chat/completions` (no SDK). `response_format: {type: "json_object"}`, explicit `max_tokens`, `temperature: 0.2`, 45 s `AbortController` timeout, no automatic retries, one call per user action.
- Provider config: `{id, name, baseUrl, defaultModel}` for DeepSeek, OpenRouter, OpenAI, Groq. The model field is free text, prefilled from `defaultModel`.
- Every job has a prompt module and a Zod schema. Empty, non-JSON or schema-invalid responses produce the error "AI didn't return usable data" and leave the deterministic result in place.

| Job | Input | Output schema | Post-processing |
|---|---|---|---|
| Clean text | pasted text or page text | `{title, servings?, ingredients: string[]}` | Each ingredient string goes through `parseIngredientLine`. A number in the parsed result that does not appear in the source text sets `needsReview`. Lands in the review table. |
| Aisle fallback | item keys currently in `other` (batched) + aisle ids | `{assignments: {itemKey, aisleId}[]}` | Unknown aisle ids ignored. Valid answers saved as `aisleOverrides` with `source: "llm"`. |
| Swaps & tips | list item names | `{swaps: {item, swap}[], tips: string[]}` | Stored in `list.extras`, shown separately, never changes items. |

- The key lives only in the `secrets` table, is sent only to the selected provider's `baseUrl`, and is never logged.
- The LLM never produces or modifies list quantities.

## 9. Platform

### 9.1 Persistence

Dexie with `version(1)` schema; future changes use Dexie `upgrade()` migrations. UI reads through `useLiveQuery` so multiple tabs stay consistent.

### 9.2 Backup

- Export envelope: `{format: "cartcraft", schemaVersion: 1, exportedAt, data: {recipes, lists, pantryStaples, aisles, aisleOverrides, settings}}`. `secrets` and `snapshots` are excluded; any property named like `apiKey`/`key`/`token` is stripped defensively.
- Export: Blob download named `cartcraft-backup-YYYY-MM-DD.json`. When `navigator.canShare({files})` is true, also offer Share (as `text/plain`).
- Import: file picker (accepts `.json` and `text/plain`) or paste. Steps: parse JSON -> check `format` -> refuse `schemaVersion` greater than current -> migrate up -> Zod `safeParse` -> show summary (counts) and confirm -> write snapshot -> replace all exportable tables in one transaction.
- "Undo last import" restores the snapshot in one transaction and clears it.

### 9.3 PWA

- vite-plugin-pwa with `registerType: "prompt"`, `useRegisterSW`, a "New version available, reload?" toast, and an hourly `registration.update()`.
- Precache the app shell. `/api/*` is never cached by the service worker.
- `public/_headers`: `Cache-Control: no-cache` for `/`, `/index.html`, `/sw.js`, `/manifest.webmanifest`; long-lived immutable caching for hashed `/assets/*`; the CSP header.
- Manifest: name, short name, icons (192, 512, maskable), `display: standalone`, theme color.

### 9.4 Security

CSP: `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self' <provider origins>; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`. Fonts are self-hosted (no Google Fonts CDN). No third-party scripts.

### 9.5 Hosting

Cloudflare Pages, deployed with Wrangler. Local dev: `vite` for the UI, `wrangler pages dev` for the function, with Vite proxying `/api` to Wrangler. The Netlify comparison happens at deploy time; only `functions/api/import.ts` would change.

## 10. Testing

Test-first for `src/domain/`.

### 10.1 Domain test suite

Every case in the "Gotchas checklist" of [recipe-data-domain.md](../../research/recipe-data-domain.md) becomes a test, with these decisions for the cases the research left open:

- `2 tbsp butter` + `1/4 cup butter` [US] -> "Butter: 6 tbsp" (largest unit where the value is at least 1).
- `500 g` + `750 g` [metric] -> "1.25 kg".
- base 8 -> target 1 on `1/4 tsp cayenne` -> "pinch".
- `salt and pepper to taste` -> one line, item "salt and pepper", `needsReview: true`, not scalable.
- `1 tablespoon lemon juice, plus 2 teaspoons zest` -> one line, notes "plus 2 teaspoons zest", `needsReview: true`.
- Two Recipe objects in JSON-LD -> the one matching the page URL, else the first.
- Decimal comma: "1,5 kg" -> 1.5 kg; "1,000 g" -> 1000 g.

### 10.2 Other layers

- Vitest + `fake-indexeddb`: repositories, backup export/import/migrate/validate/undo, key stripping.
- Vitest + Testing Library: review table editing, list check-off and undo, move-to-aisle, servings stepper.
- Function: unit tests for URL validation and redirect re-validation, and extraction from recorded HTML fixtures (no live network).
- LLM: validators tested against recorded good, empty, malformed and wrong-shape responses. No live calls in tests.
- Playwright (Chromium): offline reload after first visit, update prompt, export then import round trip.

## 11. Acceptance criteria

1. With the network disabled after the first visit, the installed app opens, shows saved recipes, builds a list, and checks items off.
2. Building a list from the same recipes and servings twice gives identical items and amounts.
3. All domain checklist tests pass.
4. A recipe URL from a site with schema.org JSON-LD imports into the review table with correct lines and servings; a blocked site falls back to paste mode with an explanation.
5. With no LLM configured, every feature except the four LLM jobs works, and LLM buttons explain how to enable them.
6. Export from one browser and import into another reproduces recipes, lists, pantry, aisles, overrides and settings, and the file contains no API key.
7. "Undo last import" restores the previous data exactly.
8. A new deploy shows the update prompt; reloading picks up the new version.
9. `/api/import` rejects `http://localhost`, `http://127.0.0.1`, `http://10.0.0.1`, non-http schemes, and redirects to private addresses.
10. The CSP header is present and the app works with it (no console CSP violations).

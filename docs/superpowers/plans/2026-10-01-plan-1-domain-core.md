# CartCraft Plan 1: Domain Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build CartCraft's pure, deterministic domain core (parse ingredient lines, normalize item identity, scale, merge into a shopping list, format amounts, classify aisles, read recipe yields, extract schema.org Recipe JSON-LD) with a full test suite.

**Architecture:** Plain TypeScript modules in `src/domain/` with no React, no I/O, no `Date.now()` and no randomness. Ids are passed in by callers. Every behavior is pinned by Vitest tests built from the research checklist. The old AI Studio UI at the repo root is left untouched; Plan 2 replaces it.

**Tech Stack:** TypeScript 5.8 (strict, `noUncheckedIndexedAccess`), Vitest 3, `numeric-quantity` 3 (MIT), `pluralize` 8 (MIT).

**Spec:** [2026-10-01-cartcraft-rewrite-design.md](../specs/2026-10-01-cartcraft-rewrite-design.md), sections 4.1 and 5, test decisions in 10.1. **Roadmap:** [2026-10-01-roadmap.md](2026-10-01-roadmap.md).

## Global Constraints

- `src/domain/` imports nothing from React, storage, network, or other app layers. Only `numeric-quantity` and `pluralize` as third-party imports.
- Domain functions are deterministic: ids and timestamps are arguments, never generated inside.
- Quantities are stored unrounded; rounding happens only in `format.ts`.
- No fuzzy item matching. Merge identity is the exact `itemKey`.
- Never copy code or data from Mealie, KitchenOwl or Tandoor (AGPL) or Open Tandoor Data (ODbL).
- Parser decision (spike run on 2026-10-01): `parse-ingredient` 3.0.0 failed "1 and 1/2", package sizes, "1 lb 2 oz", "large" (treated as a unit), "a pinch of", and decimal commas, and rounds to 3 decimals by default. The parser is written in-house on top of `numeric-quantity` with `{ round: false }`.
- Do not use em dashes in code comments, docs or UI copy.
- Run commands from the repo root `C:\Users\misha\cartcraft` in Git Bash.

## File Structure

| File | Responsibility |
|---|---|
| `tsconfig.json` (modify) | strict mode, `noUncheckedIndexedAccess`, include only `src` |
| `vitest.config.ts` (create) | node environment, `src/**/*.test.ts` |
| `package.json` (modify) | deps and `test` / `typecheck` scripts |
| `src/domain/types.ts` | shared domain types (spec 4.1) |
| `src/domain/units.ts` | unit table, aliases, dimensions, base-unit conversion, labels |
| `src/domain/text.ts` | HTML entity decoding and line normalization |
| `src/domain/quantity.ts` | number tokens and leading quantity/range parsing |
| `src/domain/itemKey.ts` | normalized merge identity |
| `src/domain/parse.ts` | `parseIngredientLine` pipeline |
| `src/domain/scale.ts` | `scaleLine` |
| `src/domain/format.ts` | `formatAmount`, `formatAmounts`, `formatFraction` |
| `src/domain/merge.ts` | `buildListItems` |
| `src/domain/aisles.ts` | default aisles, starter dictionary, `classifyAisle` |
| `src/domain/yield.ts` | `parseYield` |
| `src/domain/jsonld.ts` | `extractRecipe` |
| `src/domain/index.ts` | public exports for the app layer |

Each module has a sibling `*.test.ts`.

---

### Task 1: Tooling, domain types and units

**Files:**
- Modify: `tsconfig.json`, `package.json`
- Create: `vitest.config.ts`, `src/domain/types.ts`, `src/domain/units.ts`
- Test: `src/domain/units.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: all types in `types.ts` (`UnitId`, `Dimension`, `UnitSystem`, `SizeWord`, `Quantity`, `PackageSize`, `IngredientLine`, `Amount`, `ListItem`); from `units.ts`: `UnitDef`, `lookupUnit(token: string): UnitDef | undefined`, `getUnit(id: UnitId): UnitDef | undefined`, `dimensionOf(unit: UnitId | undefined): Dimension`, `isPackagedUnit(id: UnitId): boolean`, `toBaseUnits(value: number, unit: UnitId): number`, `unitLabel(id: UnitId, value: number): string`.

- [ ] **Step 1: Install dependencies**

```bash
npm install numeric-quantity@^3.3.3 pluralize@^8.0.0
npm install -D vitest@^3.2.0 @types/pluralize
```

Expected: both commands finish with "added N packages" and no errors.

- [ ] **Step 2: Add scripts to `package.json`**

Set the `scripts` block to:

```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview",
  "test": "vitest run",
  "test:watch": "vitest",
  "typecheck": "tsc --noEmit"
}
```

- [ ] **Step 3: Replace `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "types": ["node"],
    "moduleResolution": "bundler",
    "isolatedModules": true,
    "moduleDetection": "force",
    "jsx": "react-jsx",
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true,
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["src"]
}
```

(The old root-level UI files are no longer type-checked; Vite still builds them until Plan 2 replaces them.)

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 5: Create `src/domain/types.ts`**

```ts
export type UnitId = string;
export type Dimension = 'volume' | 'mass' | 'count' | 'other';
export type UnitSystem = 'us' | 'metric';
export type SizeWord = 'small' | 'medium' | 'large';

/** `max` is set only for ranges such as "2-3". Values are never rounded. */
export interface Quantity {
  min: number;
  max?: number;
}

export interface PackageSize {
  quantity: number;
  unit: UnitId;
}

export interface IngredientLine {
  id: string;
  /** Original text, never discarded. */
  raw: string;
  quantity?: Quantity;
  unit?: UnitId;
  /** Display name as written, e.g. "red onion". */
  item: string;
  /** Normalized identity used for merging, e.g. "red onion". */
  itemKey: string;
  size?: SizeWord;
  packageSize?: PackageSize;
  /** Prep words and anything the parser did not understand. */
  notes: string;
  alternatives: string[];
  /** False for "to taste", "pinch", "dash" and lines without a quantity. */
  scalable: boolean;
  approximate: boolean;
  isHeader: boolean;
  needsReview: boolean;
}

export interface Amount {
  quantity: Quantity;
  unit?: UnitId;
  packageSize?: PackageSize;
}

export interface ListItem {
  id: string;
  itemKey: string;
  name: string;
  /** One entry per incompatible unit or package group. */
  amounts: Amount[];
  aisleId: string;
  group: 'aisle' | 'pantry';
  checked: boolean;
  checkedAt?: number;
  origin: 'recipe' | 'adhoc';
  fromRecipes: string[];
  notes: string;
}
```

- [ ] **Step 6: Write the failing test `src/domain/units.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { dimensionOf, isPackagedUnit, lookupUnit, toBaseUnits, unitLabel } from './units';

describe('lookupUnit', () => {
  it.each([
    ['T', 'tbsp'], ['t', 'tsp'], ['Tbsp.', 'tbsp'], ['TBSP', 'tbsp'], ['teaspoons', 'tsp'],
    ['cups', 'cup'], ['fl oz', 'fl oz'], ['ounces', 'oz'], ['lbs', 'lb'], ['Grams', 'g'],
    ['cloves', 'clove'], ['tins', 'can'],
  ])('%s -> %s', (token, id) => {
    expect(lookupUnit(token)?.id).toBe(id);
  });

  it.each(['large', 'medium', 'flour', ''])('%s is not a unit', (token) => {
    expect(lookupUnit(token)).toBeUndefined();
  });
});

describe('unit helpers', () => {
  it('knows dimensions', () => {
    expect(dimensionOf('cup')).toBe('volume');
    expect(dimensionOf('oz')).toBe('mass');
    expect(dimensionOf('fl oz')).toBe('volume');
    expect(dimensionOf(undefined)).toBe('count');
    expect(dimensionOf('clove')).toBe('other');
  });

  it('converts to base units', () => {
    expect(toBaseUnits(1, 'cup')).toBeCloseTo(236.588, 3);
    expect(toBaseUnits(1, 'lb')).toBeCloseTo(453.592, 3);
    expect(toBaseUnits(3, 'clove')).toBe(3);
  });

  it('labels singular and plural', () => {
    expect(unitLabel('cup', 1)).toBe('cup');
    expect(unitLabel('cup', 1.5)).toBe('cups');
    expect(unitLabel('tbsp', 6)).toBe('tbsp');
  });

  it('knows packaged units', () => {
    expect(isPackagedUnit('can')).toBe(true);
    expect(isPackagedUnit('clove')).toBe(false);
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npx vitest run src/domain/units.test.ts`
Expected: FAIL, "Failed to resolve import "./units"".

- [ ] **Step 8: Implement `src/domain/units.ts`**

```ts
import type { Dimension, UnitId } from './types';

export interface UnitDef {
  id: UnitId;
  dimension: Dimension;
  /** Multiplier to the dimension's base unit: mL for volume, g for mass, 1 otherwise. */
  toBase: number;
  singular: string;
  plural: string;
  packaged?: boolean;
}

const DEFS: UnitDef[] = [
  { id: 'tsp', dimension: 'volume', toBase: 4.92892, singular: 'tsp', plural: 'tsp' },
  { id: 'tbsp', dimension: 'volume', toBase: 14.7868, singular: 'tbsp', plural: 'tbsp' },
  { id: 'cup', dimension: 'volume', toBase: 236.588, singular: 'cup', plural: 'cups' },
  { id: 'fl oz', dimension: 'volume', toBase: 29.5735, singular: 'fl oz', plural: 'fl oz' },
  { id: 'pint', dimension: 'volume', toBase: 473.176, singular: 'pint', plural: 'pints' },
  { id: 'quart', dimension: 'volume', toBase: 946.353, singular: 'quart', plural: 'quarts' },
  { id: 'gallon', dimension: 'volume', toBase: 3785.41, singular: 'gallon', plural: 'gallons' },
  { id: 'ml', dimension: 'volume', toBase: 1, singular: 'ml', plural: 'ml' },
  { id: 'l', dimension: 'volume', toBase: 1000, singular: 'L', plural: 'L' },
  { id: 'mg', dimension: 'mass', toBase: 0.001, singular: 'mg', plural: 'mg' },
  { id: 'g', dimension: 'mass', toBase: 1, singular: 'g', plural: 'g' },
  { id: 'kg', dimension: 'mass', toBase: 1000, singular: 'kg', plural: 'kg' },
  { id: 'oz', dimension: 'mass', toBase: 28.3495, singular: 'oz', plural: 'oz' },
  { id: 'lb', dimension: 'mass', toBase: 453.592, singular: 'lb', plural: 'lb' },
  { id: 'clove', dimension: 'other', toBase: 1, singular: 'clove', plural: 'cloves' },
  { id: 'pinch', dimension: 'other', toBase: 1, singular: 'pinch', plural: 'pinches' },
  { id: 'dash', dimension: 'other', toBase: 1, singular: 'dash', plural: 'dashes' },
  { id: 'bunch', dimension: 'other', toBase: 1, singular: 'bunch', plural: 'bunches' },
  { id: 'slice', dimension: 'other', toBase: 1, singular: 'slice', plural: 'slices' },
  { id: 'piece', dimension: 'other', toBase: 1, singular: 'piece', plural: 'pieces' },
  { id: 'sprig', dimension: 'other', toBase: 1, singular: 'sprig', plural: 'sprigs' },
  { id: 'stalk', dimension: 'other', toBase: 1, singular: 'stalk', plural: 'stalks' },
  { id: 'head', dimension: 'other', toBase: 1, singular: 'head', plural: 'heads' },
  { id: 'handful', dimension: 'other', toBase: 1, singular: 'handful', plural: 'handfuls' },
  { id: 'stick', dimension: 'other', toBase: 1, singular: 'stick', plural: 'sticks' },
  { id: 'can', dimension: 'other', toBase: 1, singular: 'can', plural: 'cans', packaged: true },
  { id: 'jar', dimension: 'other', toBase: 1, singular: 'jar', plural: 'jars', packaged: true },
  { id: 'bottle', dimension: 'other', toBase: 1, singular: 'bottle', plural: 'bottles', packaged: true },
  { id: 'package', dimension: 'other', toBase: 1, singular: 'package', plural: 'packages', packaged: true },
  { id: 'bag', dimension: 'other', toBase: 1, singular: 'bag', plural: 'bags', packaged: true },
  { id: 'box', dimension: 'other', toBase: 1, singular: 'box', plural: 'boxes', packaged: true },
  { id: 'container', dimension: 'other', toBase: 1, singular: 'container', plural: 'containers', packaged: true },
];

const ALIASES: Record<string, UnitId> = {
  tsp: 'tsp', tsps: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp',
  tbsp: 'tbsp', tbsps: 'tbsp', tbs: 'tbsp', tbl: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp',
  cup: 'cup', cups: 'cup', c: 'cup',
  'fl oz': 'fl oz', 'fl. oz': 'fl oz', floz: 'fl oz', 'fluid ounce': 'fl oz', 'fluid ounces': 'fl oz',
  pint: 'pint', pints: 'pint', pt: 'pint',
  quart: 'quart', quarts: 'quart', qt: 'quart',
  gallon: 'gallon', gallons: 'gallon', gal: 'gallon',
  ml: 'ml', milliliter: 'ml', milliliters: 'ml', millilitre: 'ml', millilitres: 'ml',
  l: 'l', liter: 'l', liters: 'l', litre: 'l', litres: 'l',
  mg: 'mg', milligram: 'mg', milligrams: 'mg',
  g: 'g', gm: 'g', gram: 'g', grams: 'g',
  kg: 'kg', kilogram: 'kg', kilograms: 'kg', kilo: 'kg', kilos: 'kg',
  oz: 'oz', ounce: 'oz', ounces: 'oz',
  lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
  clove: 'clove', cloves: 'clove',
  pinch: 'pinch', pinches: 'pinch',
  dash: 'dash', dashes: 'dash',
  bunch: 'bunch', bunches: 'bunch',
  slice: 'slice', slices: 'slice',
  piece: 'piece', pieces: 'piece', pc: 'piece', pcs: 'piece',
  sprig: 'sprig', sprigs: 'sprig',
  stalk: 'stalk', stalks: 'stalk',
  head: 'head', heads: 'head',
  handful: 'handful', handfuls: 'handful',
  stick: 'stick', sticks: 'stick',
  can: 'can', cans: 'can', tin: 'can', tins: 'can',
  jar: 'jar', jars: 'jar',
  bottle: 'bottle', bottles: 'bottle',
  package: 'package', packages: 'package', pkg: 'package', packet: 'package', packets: 'package',
  bag: 'bag', bags: 'bag',
  box: 'box', boxes: 'box',
  container: 'container', containers: 'container',
};

const BY_ID = new Map(DEFS.map((d) => [d.id, d]));

/** Resolves a unit word as written in a recipe. Case matters only for "T" (tbsp) and "t" (tsp). */
export function lookupUnit(token: string): UnitDef | undefined {
  const t = token.trim().replace(/\.$/, '');
  if (t === 'T' || t === 'Tb') return BY_ID.get('tbsp');
  if (t === 't') return BY_ID.get('tsp');
  const id = ALIASES[t.toLowerCase().replace(/\s+/g, ' ')];
  return id === undefined ? undefined : BY_ID.get(id);
}

export function getUnit(id: UnitId): UnitDef | undefined {
  return BY_ID.get(id);
}

/** A missing unit means a plain count ("3 eggs"). Unknown ids are treated as "other". */
export function dimensionOf(unit: UnitId | undefined): Dimension {
  if (unit === undefined) return 'count';
  return BY_ID.get(unit)?.dimension ?? 'other';
}

export function isPackagedUnit(id: UnitId): boolean {
  return BY_ID.get(id)?.packaged === true;
}

/** Converts to mL (volume) or g (mass). Other dimensions are returned unchanged. */
export function toBaseUnits(value: number, unit: UnitId): number {
  return value * (BY_ID.get(unit)?.toBase ?? 1);
}

export function unitLabel(id: UnitId, value: number): string {
  const def = BY_ID.get(id);
  if (!def) return id;
  return value > 1 ? def.plural : def.singular;
}
```

- [ ] **Step 9: Run tests and typecheck**

Run: `npx vitest run src/domain/units.test.ts && npm run typecheck`
Expected: all tests in `units.test.ts` PASS; `tsc` prints nothing.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts src/domain/types.ts src/domain/units.ts src/domain/units.test.ts
git commit -m "feat(domain): add tooling, domain types and unit table"
```

---

### Task 2: Text normalization and quantity parsing

**Files:**
- Create: `src/domain/text.ts`, `src/domain/quantity.ts`
- Test: `src/domain/text.test.ts`, `src/domain/quantity.test.ts`

**Interfaces:**
- Consumes: `Quantity` from `types.ts`.
- Produces: `decodeEntities(s: string): string`, `normalizeText(raw: string): string` (text.ts); `NUM: string` (regex source for one number token), `toNumber(token: string): number | undefined`, `parseLeadingAmount(text: string): { quantity?: Quantity; rest: string }` (quantity.ts).

- [ ] **Step 1: Write the failing tests**

`src/domain/text.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { decodeEntities, normalizeText } from './text';

describe('decodeEntities', () => {
  it.each([
    ['&amp;frac12;', '½'],
    ['Mac &amp;amp; Cheese', 'Mac & Cheese'],
    ['&#189; cup', '½ cup'],
    ['&#xBD; cup', '½ cup'],
    ['&unknown; stays', '&unknown; stays'],
  ])('%s -> %s', (input, expected) => {
    expect(decodeEntities(input)).toBe(expected);
  });
});

describe('normalizeText', () => {
  it.each([
    ['1½ cups flour', '1 1/2 cups flour'],
    ['½-¾ cup sugar', '1/2-3/4 cup sugar'],
    ['1/2&nbsp;cup cream', '1/2 cup cream'],
    ['- 2 cups sugar', '2 cups sugar'],
    ['• 1 egg', '1 egg'],
    ['flour*', 'flour'],
    ['  2   eggs  ', '2 eggs'],
    ['2\u20133 cloves', '2-3 cloves'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeText(input)).toBe(expected);
  });
});
```

`src/domain/quantity.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseLeadingAmount, toNumber } from './quantity';

describe('toNumber', () => {
  it.each([
    ['1 1/2', 1.5], ['1 and 1/2', 1.5], ['1/2', 0.5], ['1.5', 1.5], ['1,5', 1.5], ['1,000', 1000], ['2', 2],
  ])('%s -> %d', (token, n) => {
    expect(toNumber(token)).toBe(n);
  });

  it('does not round thirds', () => {
    expect(toNumber('1/3')).toBeCloseTo(1 / 3, 10);
  });

  it('returns undefined for non-numbers', () => {
    expect(toNumber('abc')).toBeUndefined();
  });
});

describe('parseLeadingAmount', () => {
  it.each([
    ['2 cups flour', { min: 2 }, 'cups flour'],
    ['2-3 cloves', { min: 2, max: 3 }, 'cloves'],
    ['2 to 3 tbsp oil', { min: 2, max: 3 }, 'tbsp oil'],
    ['1 or 2 jalapeños', { min: 1, max: 2 }, 'jalapeños'],
    ['2 oranges', { min: 2 }, 'oranges'],
    ['2 tomatoes', { min: 2 }, 'tomatoes'],
    ['2 14-ounce cans', { min: 2 }, '14-ounce cans'],
  ])('%s', (text, quantity, rest) => {
    expect(parseLeadingAmount(text)).toEqual({ quantity, rest });
  });

  it('returns the text unchanged without a leading number', () => {
    expect(parseLeadingAmount('salt to taste')).toEqual({ rest: 'salt to taste' });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/domain/text.test.ts src/domain/quantity.test.ts`
Expected: FAIL, imports `./text` and `./quantity` cannot be resolved.

- [ ] **Step 3: Implement `src/domain/text.ts`**

```ts
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  frac12: '½', frac14: '¼', frac34: '¾', frac13: '⅓', frac23: '⅔',
  frac18: '⅛', frac38: '⅜', frac58: '⅝', frac78: '⅞',
  deg: '°', ndash: '-', mdash: '-', hellip: '...',
  rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"',
};

function decodeOnce(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (match, body: string) => {
    if (body.startsWith('#')) {
      const hex = body[1] === 'x' || body[1] === 'X';
      const code = hex ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

/** Decodes HTML entities, repeating to undo double encoding such as "&amp;frac12;". */
export function decodeEntities(s: string): string {
  let current = s;
  for (let i = 0; i < 3; i++) {
    const next = decodeOnce(current);
    if (next === current) break;
    current = next;
  }
  return current;
}

const UNICODE_FRACTIONS: Record<string, string> = {
  '½': '1/2', '⅓': '1/3', '⅔': '2/3', '¼': '1/4', '¾': '3/4',
  '⅕': '1/5', '⅖': '2/5', '⅗': '3/5', '⅘': '4/5', '⅙': '1/6', '⅚': '5/6',
  '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8',
};

/** Entities, unicode fractions and dashes, bullets, footnote markers and whitespace. */
export function normalizeText(raw: string): string {
  let s = decodeEntities(raw);
  s = s.replace(/[   ]/g, ' ');
  s = s.replace(/⁄/g, '/');
  s = s.replace(/[‐-―−]/g, '-');
  s = s.replace(/(\d)?([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/g, (_m, digit: string | undefined, frac: string) =>
    (digit ? `${digit} ` : '') + (UNICODE_FRACTIONS[frac] ?? frac),
  );
  s = s.replace(/^\s*(?:[-*•·▢□◦]+\s*)+/, '');
  s = s.replace(/[*†‡]+/g, '');
  return s.replace(/\s+/g, ' ').trim();
}
```

- [ ] **Step 4: Implement `src/domain/quantity.ts`**

```ts
import { numericQuantity } from 'numeric-quantity';
import type { Quantity } from './types';

/** A single number as written in recipes: "1 and 1/2", "1 1/2", "1/2", "1.5", "1,5", "1,000". */
export const NUM = String.raw`(?:\d+\s+and\s+\d+\/\d+|\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)*)`;

const LEADING_AMOUNT = new RegExp(
  String.raw`^(${NUM})(?:\s*(?:-|to|or)\s*(${NUM}))?(?=\s|$|[a-zA-Z(])`,
  'i',
);

/** Parses one NUM token without rounding. Returns undefined for anything else. */
export function toNumber(token: string): number | undefined {
  let t = token.trim().replace(/\s+and\s+/i, ' ');
  if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(t)) t = t.replace(/,/g, '');
  else t = t.replace(',', '.');
  const n = numericQuantity(t, { round: false });
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** Reads a quantity or range at the start of `text` and returns the remaining text. */
export function parseLeadingAmount(text: string): { quantity?: Quantity; rest: string } {
  const match = LEADING_AMOUNT.exec(text);
  if (!match || match[1] === undefined) return { rest: text };
  const min = toNumber(match[1]);
  if (min === undefined) return { rest: text };
  const max = match[2] === undefined ? undefined : toNumber(match[2]);
  const quantity: Quantity = max !== undefined && max > min ? { min, max } : { min };
  return { quantity, rest: text.slice(match[0].length).trim() };
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run src/domain/text.test.ts src/domain/quantity.test.ts && npm run typecheck`
Expected: PASS; `tsc` prints nothing.

- [ ] **Step 6: Commit**

```bash
git add src/domain/text.ts src/domain/text.test.ts src/domain/quantity.ts src/domain/quantity.test.ts
git commit -m "feat(domain): normalize ingredient text and parse quantities without rounding"
```

---

### Task 3: Item identity and the ingredient line parser

**Files:**
- Create: `src/domain/itemKey.ts`, `src/domain/parse.ts`
- Test: `src/domain/itemKey.test.ts`, `src/domain/parse.test.ts`

**Interfaces:**
- Consumes: `normalizeText` (text.ts); `NUM`, `toNumber`, `parseLeadingAmount` (quantity.ts); `lookupUnit`, `isPackagedUnit` (units.ts); `IngredientLine`, `PackageSize`, `Quantity`, `SizeWord`, `UnitId` (types.ts).
- Produces: `itemKey(item: string): string`; `parseIngredientLine(raw: string, id: string): IngredientLine`.

- [ ] **Step 1: Write the failing tests**

`src/domain/itemKey.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { itemKey } from './itemKey';

describe('itemKey', () => {
  it.each([
    ['Eggs', 'egg'],
    ['bay leaves', 'bay leaf'],
    ['red onion', 'red onion'],
    ['fresh basil', 'basil'],
    ['minced garlic', 'garlic'],
    ['diced tomatoes', 'diced tomato'],
    ['Scallions', 'green onion'],
    ["confectioners' sugar", 'powdered sugar'],
    ['molasses', 'molasses'],
    ['jalapeños', 'jalapeño'],
    ['', ''],
  ])('%s -> %s', (item, key) => {
    expect(itemKey(item)).toBe(key);
  });
});
```

`src/domain/parse.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseIngredientLine } from './parse';

const parse = (raw: string) => parseIngredientLine(raw, 'id-1');

describe('parseIngredientLine: amounts', () => {
  it.each([
    ['1 1/2 cups flour', 1.5, 'cup', 'flour'],
    ['1½ cups flour', 1.5, 'cup', 'flour'],
    ['½ tsp salt', 0.5, 'tsp', 'salt'],
    ['1 and 1/2 cups milk', 1.5, 'cup', 'milk'],
    ['&frac12; cup cream', 0.5, 'cup', 'cream'],
    ['1/2&nbsp;cup cream', 0.5, 'cup', 'cream'],
    ['-2 cups sugar', 2, 'cup', 'sugar'],
    ['1,5 kg Mehl', 1.5, 'kg', 'Mehl'],
    ['1,000 g flour', 1000, 'g', 'flour'],
  ])('%s', (raw, min, unit, item) => {
    const line = parse(raw);
    expect(line.quantity).toEqual({ min });
    expect(line.unit).toBe(unit);
    expect(line.item).toBe(item);
  });

  it('keeps 1/3 unrounded', () => {
    expect(parse('1/3 cup sugar').quantity?.min).toBeCloseTo(1 / 3, 10);
  });

  it.each([
    ['2-3 cloves garlic, minced', { min: 2, max: 3 }, 'clove', 'garlic', 'minced'],
    ['2 to 3 tbsp olive oil', { min: 2, max: 3 }, 'tbsp', 'olive oil', ''],
    ['½-¾ cup sugar', { min: 0.5, max: 0.75 }, 'cup', 'sugar', ''],
  ])('range %s', (raw, quantity, unit, item, notes) => {
    const line = parse(raw);
    expect(line.quantity).toEqual(quantity);
    expect(line.unit).toBe(unit);
    expect(line.item).toBe(item);
    expect(line.notes).toBe(notes);
  });

  it('1 or 2 jalapeños is a range with no unit', () => {
    const line = parse('1 or 2 jalapeños');
    expect(line.quantity).toEqual({ min: 1, max: 2 });
    expect(line.unit).toBeUndefined();
    expect(line.itemKey).toBe('jalapeño');
  });

  it('about 2 cups spinach is approximate', () => {
    const line = parse('about 2 cups spinach');
    expect(line.quantity).toEqual({ min: 2 });
    expect(line.approximate).toBe(true);
    expect(line.item).toBe('spinach');
  });

  it('Ripe tomato x2', () => {
    const line = parse('Ripe tomato x2');
    expect(line.quantity).toEqual({ min: 2 });
    expect(line.itemKey).toBe('tomato');
  });

  it('Juice of 2 lemons', () => {
    const line = parse('Juice of 2 lemons');
    expect(line.quantity).toEqual({ min: 2 });
    expect(line.itemKey).toBe('lemon');
    expect(line.notes).toBe('juice');
  });
});

describe('parseIngredientLine: units', () => {
  it.each([
    ['1 T sugar', 'tbsp'],
    ['1 t sugar', 'tsp'],
    ['1 Tbsp. butter', 'tbsp'],
    ['8 fl oz milk', 'fl oz'],
    ['8 oz cream cheese', 'oz'],
  ])('%s -> %s', (raw, unit) => {
    expect(parse(raw).unit).toBe(unit);
  });

  it('1 tsp ground cloves: cloves is the item, not the unit', () => {
    const line = parse('1 tsp ground cloves');
    expect(line.unit).toBe('tsp');
    expect(line.item).toBe('ground cloves');
  });

  it('1 cup gram flour: gram is part of the item', () => {
    const line = parse('1 cup gram flour');
    expect(line.unit).toBe('cup');
    expect(line.item).toBe('gram flour');
  });

  it('1 lb 2 oz cheddar becomes 18 oz', () => {
    const line = parse('1 lb 2 oz cheddar');
    expect(line.quantity).toEqual({ min: 18 });
    expect(line.unit).toBe('oz');
    expect(line.item).toBe('cheddar');
  });

  it('1 cup (240 ml) milk keeps the conversion as a note', () => {
    const line = parse('1 cup (240 ml) milk');
    expect(line.unit).toBe('cup');
    expect(line.item).toBe('milk');
    expect(line.notes).toBe('240 ml');
  });

  it.each([
    ['a pinch of salt', 'salt'],
    ['pinch of nutmeg', 'nutmeg'],
  ])('%s is 1 pinch and not scalable', (raw, item) => {
    const line = parse(raw);
    expect(line.quantity).toEqual({ min: 1 });
    expect(line.unit).toBe('pinch');
    expect(line.item).toBe(item);
    expect(line.scalable).toBe(false);
  });
});

describe('parseIngredientLine: package sizes and size words', () => {
  it('1 (14 oz) can diced tomatoes', () => {
    const line = parse('1 (14 oz) can diced tomatoes');
    expect(line.quantity).toEqual({ min: 1 });
    expect(line.unit).toBe('can');
    expect(line.packageSize).toEqual({ quantity: 14, unit: 'oz' });
    expect(line.item).toBe('diced tomatoes');
  });

  it('2 14-ounce cans coconut milk', () => {
    const line = parse('2 14-ounce cans coconut milk');
    expect(line.quantity).toEqual({ min: 2 });
    expect(line.unit).toBe('can');
    expect(line.packageSize).toEqual({ quantity: 14, unit: 'oz' });
    expect(line.item).toBe('coconut milk');
  });

  it('2 large eggs: large is a size, not a unit', () => {
    const line = parse('2 large eggs');
    expect(line.quantity).toEqual({ min: 2 });
    expect(line.unit).toBeUndefined();
    expect(line.size).toBe('large');
    expect(line.itemKey).toBe('egg');
  });

  it('1 medium onion, diced', () => {
    const line = parse('1 medium onion, diced');
    expect(line.size).toBe('medium');
    expect(line.item).toBe('onion');
    expect(line.notes).toBe('diced');
  });
});

describe('parseIngredientLine: items, notes and flags', () => {
  it.each([
    ['3 eggs', 'egg'],
    ['1 egg', 'egg'],
    ['1 red onion, thinly sliced', 'red onion'],
    ['2 bay leaves', 'bay leaf'],
    ['flour*', 'flour'],
  ])('%s -> itemKey %s', (raw, key) => {
    expect(parse(raw).itemKey).toBe(key);
  });

  it('Salt, to taste has no quantity and is not scalable', () => {
    const line = parse('Salt, to taste');
    expect(line.quantity).toBeUndefined();
    expect(line.item).toBe('Salt');
    expect(line.notes).toBe('to taste');
    expect(line.scalable).toBe(false);
  });

  it('salt and pepper to taste is one line flagged for review', () => {
    const line = parse('salt and pepper to taste');
    expect(line.item).toBe('salt and pepper');
    expect(line.needsReview).toBe(true);
    expect(line.scalable).toBe(false);
  });

  it('1 cup chicken stock (or broth)', () => {
    const line = parse('1 cup chicken stock (or broth)');
    expect(line.item).toBe('chicken stock');
    expect(line.alternatives).toEqual(['broth']);
  });

  it('1 cup butter or margarine', () => {
    const line = parse('1 cup butter or margarine');
    expect(line.item).toBe('butter');
    expect(line.alternatives).toEqual(['margarine']);
  });

  it('plus clauses stay on one line and are flagged', () => {
    const line = parse('1 tablespoon lemon juice, plus 2 teaspoons zest');
    expect(line.quantity).toEqual({ min: 1 });
    expect(line.unit).toBe('tbsp');
    expect(line.item).toBe('lemon juice');
    expect(line.notes).toBe('plus 2 teaspoons zest');
    expect(line.needsReview).toBe(true);
  });

  it('For the sauce: is a header', () => {
    const line = parse('For the sauce:');
    expect(line.isHeader).toBe(true);
    expect(line.item).toBe('For the sauce');
  });

  it('a clean line is not flagged', () => {
    const line = parse('2 cups flour');
    expect(line.needsReview).toBe(false);
    expect(line.scalable).toBe(true);
  });

  it.each(['', '   ', 'x'.repeat(600)])('never throws on bad input (%#)', (raw) => {
    const line = parse(raw);
    expect(line.raw).toBe(raw);
    expect(line.needsReview).toBe(true);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/domain/itemKey.test.ts src/domain/parse.test.ts`
Expected: FAIL, imports `./itemKey` and `./parse` cannot be resolved.

- [ ] **Step 3: Implement `src/domain/itemKey.ts`**

```ts
import pluralize from 'pluralize';

for (const word of ['molasses', 'hummus', 'couscous', 'asparagus', 'swiss', 'grits', 'greens']) {
  pluralize.addUncountableRule(word);
}

/**
 * Leading size, freshness and prep words that never change what you buy.
 * Color and variety words ("red onion", "ground beef") are kept, and so are "diced" and
 * "crushed" because they name canned products ("diced tomatoes").
 */
const DESCRIPTORS = new Set([
  'fresh', 'freshly', 'ripe', 'whole', 'small', 'medium', 'large',
  'minced', 'chopped', 'sliced', 'grated', 'shredded', 'peeled',
  'softened', 'melted', 'finely', 'thinly', 'roughly', 'coarsely',
]);

const ALIASES: Record<string, string> = {
  scallion: 'green onion',
  'spring onion': 'green onion',
  'garbanzo bean': 'chickpea',
  'coriander leaf': 'cilantro',
  'confectioners sugar': 'powdered sugar',
  'icing sugar': 'powdered sugar',
  'caster sugar': 'superfine sugar',
  aubergine: 'eggplant',
  courgette: 'zucchini',
  capsicum: 'bell pepper',
  'plain flour': 'all-purpose flour',
  'all purpose flour': 'all-purpose flour',
  'ap flour': 'all-purpose flour',
  'heavy whipping cream': 'heavy cream',
};

/** Normalized merge identity: lowercase, no leading descriptors, singular last word, aliases applied. No fuzzy matching. */
export function itemKey(item: string): string {
  const cleaned = item
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/[^a-z0-9ñéèáíóúü\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = cleaned.split(' ').filter(Boolean);
  while (words.length > 1 && DESCRIPTORS.has(words[0] ?? '')) words.shift();
  const last = words.pop();
  if (last === undefined) return '';
  words.push(pluralize.singular(last));
  const key = words.join(' ');
  return ALIASES[key] ?? key;
}
```

- [ ] **Step 4: Implement `src/domain/parse.ts`**

```ts
import { itemKey } from './itemKey';
import { NUM, parseLeadingAmount, toNumber } from './quantity';
import { normalizeText } from './text';
import type { IngredientLine, PackageSize, Quantity, SizeWord, UnitId } from './types';
import { isPackagedUnit, lookupUnit } from './units';

const MAX_LINE_LENGTH = 512;
const NON_SCALABLE_UNITS = new Set<UnitId>(['pinch', 'dash']);

const APPROXIMATE = /^(?:about|approx\.?|approximately|around|roughly|~)\s*/i;
const TO_TASTE = /,?\s*\b(?:to taste|as needed|as required)\b\.?/gi;
const JUICE_OR_ZEST = new RegExp(String.raw`^(juice|zest) of (${NUM}) (.+)$`, 'i');
const TRAILING_TIMES = /\s+x\s?(\d+)$/i;
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
    } else {
      const article = ARTICLE.exec(text);
      const afterArticle = article ? text.slice(article[0].length) : '';
      const articleUnit = UNIT_WORD.exec(afterArticle)?.[0];
      if (article && articleUnit && lookupUnit(articleUnit)) {
        quantity = { min: 1 };
        text = afterArticle;
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
    !item || /\s+and\s+/i.test(item) || notes.some((n) => /^plus\b/i.test(n));
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

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run src/domain/itemKey.test.ts src/domain/parse.test.ts && npm run typecheck`
Expected: PASS; `tsc` prints nothing.

- [ ] **Step 6: Commit**

```bash
git add src/domain/itemKey.ts src/domain/itemKey.test.ts src/domain/parse.ts src/domain/parse.test.ts
git commit -m "feat(domain): parse ingredient lines into structured, reviewable lines"
```

---

### Task 4: Scaling and display formatting

**Files:**
- Create: `src/domain/scale.ts`, `src/domain/format.ts`
- Test: `src/domain/scale.test.ts`, `src/domain/format.test.ts`

**Interfaces:**
- Consumes: `parseIngredientLine` (tests only); `dimensionOf`, `getUnit`, `isPackagedUnit`, `toBaseUnits`, `unitLabel` (units.ts); `Amount`, `IngredientLine`, `PackageSize`, `UnitId`, `UnitSystem` (types.ts).
- Produces: `scaleLine(line: IngredientLine, baseServings: number, targetServings: number): IngredientLine`; `formatFraction(n: number, steps?): string`, `formatAmount(amount: Amount, system: UnitSystem): string`, `formatAmounts(amounts: Amount[], system: UnitSystem): string`.

Display rules (spec 5.5): US volume uses the largest of cup, tbsp, tsp whose value is at least 1, snapped to eighths or thirds; under 1/8 tsp shows "pinch". US mass is oz under 16 oz, else lb, snapped to quarters. Metric uses g/ml under 1000, else kg/L with at most 2 decimals. Counts and discrete units round up. Package sizes read as on the label unless the label uses the other unit system.

- [ ] **Step 1: Write the failing tests**

`src/domain/scale.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseIngredientLine } from './parse';
import { scaleLine } from './scale';

const scaled = (raw: string, base: number, target: number) =>
  scaleLine(parseIngredientLine(raw, 'id'), base, target);

describe('scaleLine', () => {
  it('multiplies the quantity by target / base', () => {
    expect(scaled('1 cup milk', 4, 6).quantity).toEqual({ min: 1.5 });
  });

  it('scales both ends of a range', () => {
    expect(scaled('2-3 cloves garlic', 2, 4).quantity).toEqual({ min: 4, max: 6 });
  });

  it('never scales the package size', () => {
    const line = scaled('1 (14 oz) can beans', 4, 2);
    expect(line.quantity).toEqual({ min: 0.5 });
    expect(line.packageSize).toEqual({ quantity: 14, unit: 'oz' });
  });

  it('never scales numbers inside notes', () => {
    const line = scaled('1 lb beef, cut into 1-inch cubes', 4, 8);
    expect(line.quantity).toEqual({ min: 2 });
    expect(line.notes).toBe('cut into 1-inch cubes');
  });

  it('leaves a pinch alone', () => {
    expect(scaled('a pinch of salt', 4, 8).quantity).toEqual({ min: 1 });
  });

  it('leaves to-taste lines alone', () => {
    expect(scaled('Salt, to taste', 4, 8).quantity).toBeUndefined();
  });

  it('returns the line unchanged when base servings is not positive', () => {
    expect(scaled('1 cup milk', 0, 6).quantity).toEqual({ min: 1 });
  });
});
```

`src/domain/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatAmount, formatAmounts, formatFraction } from './format';

describe('formatFraction', () => {
  it.each([
    [1.5, '1 1/2'],
    [1 / 3, '1/3'],
    [2, '2'],
    [0.999, '1'],
    [0.75, '3/4'],
    [2.66, '2 2/3'],
    [0.01, '0'],
  ])('%d -> %s', (n, expected) => {
    expect(formatFraction(n)).toBe(expected);
  });
});

describe('formatAmount (us)', () => {
  it.each([
    [{ quantity: { min: 354.882 }, unit: 'ml' }, '1 1/2 cups'],
    [{ quantity: { min: 88.72 }, unit: 'ml' }, '6 tbsp'],
    [{ quantity: { min: 0.75 }, unit: 'tsp' }, '3/4 tsp'],
    [{ quantity: { min: 1 / 32 }, unit: 'tsp' }, 'pinch'],
    [{ quantity: { min: 1 }, unit: 'cup' }, '1 cup'],
    [{ quantity: { min: 340.194 }, unit: 'g' }, '12 oz'],
    [{ quantity: { min: 907.184 }, unit: 'g' }, '2 lb'],
    [{ quantity: { min: 4.5 } }, '5'],
    [{ quantity: { min: 3, max: 4 }, unit: 'clove' }, '3-4 cloves'],
    [{ quantity: { min: 0.5 }, unit: 'can', packageSize: { quantity: 14, unit: 'oz' } }, '1 can (14 oz)'],
    [{ quantity: { min: 1 }, unit: 'pinch' }, '1 pinch'],
    [{ quantity: { min: 1 }, unit: 'can', packageSize: { quantity: 28, unit: 'oz' } }, '1 can (28 oz)'],
  ])('%j -> %s', (amount, expected) => {
    expect(formatAmount(amount, 'us')).toBe(expected);
  });
});

describe('formatAmount (metric)', () => {
  it.each([
    [{ quantity: { min: 1250 }, unit: 'g' }, '1.25 kg'],
    [{ quantity: { min: 340.194 }, unit: 'g' }, '340 g'],
    [{ quantity: { min: 1 }, unit: 'cup' }, '237 ml'],
    [{ quantity: { min: 1500 }, unit: 'ml' }, '1.5 L'],
    [{ quantity: { min: 12 }, unit: 'oz' }, '340 g'],
    [{ quantity: { min: 1 }, unit: 'can', packageSize: { quantity: 400, unit: 'g' } }, '1 can (400 g)'],
    [{ quantity: { min: 1 }, unit: 'can', packageSize: { quantity: 14, unit: 'oz' } }, '1 can (397 g)'],
  ])('%j -> %s', (amount, expected) => {
    expect(formatAmount(amount, 'metric')).toBe(expected);
  });
});

describe('formatAmounts', () => {
  it('joins incompatible amounts with +', () => {
    expect(
      formatAmounts([{ quantity: { min: 2 }, unit: 'clove' }, { quantity: { min: 1 }, unit: 'tbsp' }], 'us'),
    ).toBe('2 cloves + 1 tbsp');
  });

  it('returns an empty string for no amounts', () => {
    expect(formatAmounts([], 'us')).toBe('');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/domain/scale.test.ts src/domain/format.test.ts`
Expected: FAIL, imports `./scale` and `./format` cannot be resolved.

- [ ] **Step 3: Implement `src/domain/scale.ts`**

```ts
import type { IngredientLine } from './types';

/**
 * Scales the main quantity only. Package sizes, numbers inside notes, and lines that are
 * not scalable ("to taste", "pinch") are returned unchanged.
 */
export function scaleLine(line: IngredientLine, baseServings: number, targetServings: number): IngredientLine {
  if (!line.scalable || !line.quantity || baseServings <= 0 || targetServings === baseServings) return line;
  const factor = targetServings / baseServings;
  const { min, max } = line.quantity;
  return {
    ...line,
    quantity: max === undefined ? { min: min * factor } : { min: min * factor, max: max * factor },
  };
}
```

- [ ] **Step 4: Implement `src/domain/format.ts`**

```ts
import type { Amount, PackageSize, UnitId, UnitSystem } from './types';
import { dimensionOf, getUnit, isPackagedUnit, toBaseUnits, unitLabel } from './units';

interface Step {
  value: number;
  label: string;
}

const KITCHEN_STEPS: Step[] = [
  { value: 0, label: '' }, { value: 1 / 8, label: '1/8' }, { value: 1 / 4, label: '1/4' },
  { value: 1 / 3, label: '1/3' }, { value: 3 / 8, label: '3/8' }, { value: 1 / 2, label: '1/2' },
  { value: 5 / 8, label: '5/8' }, { value: 2 / 3, label: '2/3' }, { value: 3 / 4, label: '3/4' },
  { value: 7 / 8, label: '7/8' }, { value: 1, label: '' },
];

const QUARTER_STEPS: Step[] = [
  { value: 0, label: '' }, { value: 1 / 4, label: '1/4' }, { value: 1 / 2, label: '1/2' },
  { value: 3 / 4, label: '3/4' }, { value: 1, label: '' },
];

const EPSILON = 1e-6;

/** Snaps to the nearest step and renders "1 1/2", "1/3", "2". */
export function formatFraction(n: number, steps: Step[] = KITCHEN_STEPS): string {
  let whole = Math.floor(n + EPSILON);
  const frac = n - whole;
  let best = 0;
  for (let i = 1; i < steps.length; i++) {
    if (Math.abs(frac - (steps[i]?.value ?? 0)) < Math.abs(frac - (steps[best]?.value ?? 0))) best = i;
  }
  if (best === steps.length - 1) {
    whole += 1;
    best = 0;
  }
  const label = steps[best]?.label ?? '';
  if (whole === 0) return label || '0';
  return label ? `${whole} ${label}` : `${whole}`;
}

function formatDecimal(n: number, maxDecimals: number): string {
  return String(Number(n.toFixed(maxDecimals)));
}

interface Rendered {
  unit: UnitId;
  render: (value: number) => string;
}

function pickVolume(minMl: number, system: UnitSystem): Rendered | 'pinch' {
  if (system === 'metric') {
    if (minMl < 999.5) return { unit: 'ml', render: (v) => formatDecimal(v, v < 10 ? 1 : 0) };
    return { unit: 'l', render: (v) => formatDecimal(v / 1000, 2) };
  }
  for (const unit of ['cup', 'tbsp', 'tsp'] as const) {
    const size = getUnit(unit)?.toBase ?? 1;
    if (minMl / size >= 1 - EPSILON) return { unit, render: (v) => formatFraction(v / size) };
  }
  const tsp = getUnit('tsp')?.toBase ?? 1;
  if (minMl / tsp < 1 / 8 - EPSILON) return 'pinch';
  return { unit: 'tsp', render: (v) => formatFraction(v / tsp) };
}

function pickMass(minG: number, system: UnitSystem): Rendered {
  if (system === 'metric') {
    if (minG < 999.5) return { unit: 'g', render: (v) => formatDecimal(v, v < 10 ? 1 : 0) };
    return { unit: 'kg', render: (v) => formatDecimal(v / 1000, 2) };
  }
  const oz = getUnit('oz')?.toBase ?? 1;
  const lb = getUnit('lb')?.toBase ?? 1;
  if (minG / oz < 16 - EPSILON) return { unit: 'oz', render: (v) => formatFraction(v / oz, QUARTER_STEPS) };
  return { unit: 'lb', render: (v) => formatFraction(v / lb, QUARTER_STEPS) };
}

const METRIC_UNITS = new Set<UnitId>(['mg', 'g', 'kg', 'ml', 'l']);

/** Package sizes read as printed on the label, converted only when the label uses the other unit system. */
function formatPackageSize(size: PackageSize, system: UnitSystem): string {
  if (METRIC_UNITS.has(size.unit) === (system === 'metric')) {
    return `${formatDecimal(size.quantity, 2)} ${unitLabel(size.unit, size.quantity)}`;
  }
  return formatAmount({ quantity: { min: size.quantity }, unit: size.unit }, system);
}

function withRange(min: string, max: string | undefined): string {
  return max === undefined || max === min ? min : `${min}-${max}`;
}

/** Formats one amount in the user's unit system. Counts and discrete units round up. */
export function formatAmount(amount: Amount, system: UnitSystem): string {
  const { quantity, unit, packageSize } = amount;
  const dimension = dimensionOf(unit);

  if (unit !== undefined && (dimension === 'volume' || dimension === 'mass')) {
    const minBase = toBaseUnits(quantity.min, unit);
    const maxBase = quantity.max === undefined ? undefined : toBaseUnits(quantity.max, unit);
    const picked = dimension === 'volume' ? pickVolume(minBase, system) : pickMass(minBase, system);
    if (picked === 'pinch') return 'pinch';
    const size = getUnit(picked.unit)?.toBase ?? 1;
    const min = picked.render(minBase);
    const max = maxBase === undefined ? undefined : picked.render(maxBase);
    return `${withRange(min, max)} ${unitLabel(picked.unit, (maxBase ?? minBase) / size)}`;
  }

  const min = Math.ceil(quantity.min - EPSILON);
  const max = quantity.max === undefined ? undefined : Math.ceil(quantity.max - EPSILON);
  const count = withRange(String(min), max === undefined ? undefined : String(max));
  if (unit === undefined) return count;
  const label = unitLabel(unit, max ?? min);
  if (packageSize && isPackagedUnit(unit)) {
    return `${count} ${label} (${formatPackageSize(packageSize, system)})`;
  }
  return `${count} ${label}`;
}

export function formatAmounts(amounts: Amount[], system: UnitSystem): string {
  return amounts.map((a) => formatAmount(a, system)).join(' + ');
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run src/domain/scale.test.ts src/domain/format.test.ts && npm run typecheck`
Expected: PASS; `tsc` prints nothing.

- [ ] **Step 6: Commit**

```bash
git add src/domain/scale.ts src/domain/scale.test.ts src/domain/format.ts src/domain/format.test.ts
git commit -m "feat(domain): scale lines and format amounts per unit system"
```

---

### Task 5: Merging recipes into list items

**Files:**
- Create: `src/domain/merge.ts`
- Test: `src/domain/merge.test.ts`

**Interfaces:**
- Consumes: `scaleLine` (scale.ts); `dimensionOf`, `toBaseUnits` (units.ts); `formatAmounts`, `parseIngredientLine` (tests only); `Amount`, `IngredientLine`, `ListItem`, `Quantity` (types.ts).
- Produces: `RecipeSelection { title; baseServings; targetServings; ingredients: IngredientLine[] }`, `BuildContext { pantryStaples: ReadonlySet<string>; classify: (itemKey: string) => string; makeId: () => string }`, `buildListItems(selections: RecipeSelection[], ctx: BuildContext): ListItem[]` (sorted by name). Merged volume amounts use unit `ml`, mass amounts use unit `g`.

- [ ] **Step 1: Write the failing test `src/domain/merge.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { formatAmounts } from './format';
import { buildListItems, type RecipeSelection } from './merge';
import { parseIngredientLine } from './parse';
import type { ListItem, UnitSystem } from './types';

function recipe(title: string, lines: string[], baseServings = 4, targetServings = 4): RecipeSelection {
  return {
    title,
    baseServings,
    targetServings,
    ingredients: lines.map((raw, i) => parseIngredientLine(raw, `${title}-${i}`)),
  };
}

function build(selections: RecipeSelection[], pantry: string[] = []): ListItem[] {
  let next = 0;
  return buildListItems(selections, {
    pantryStaples: new Set(pantry),
    classify: () => 'other',
    makeId: () => `item-${next++}`,
  });
}

function shown(selections: RecipeSelection[], system: UnitSystem = 'us'): Record<string, string> {
  return Object.fromEntries(build(selections).map((i) => [i.itemKey, formatAmounts(i.amounts, system)]));
}

describe('buildListItems', () => {
  it('three thirds of a cup make exactly 1 cup', () => {
    expect(shown([recipe('A', ['1/3 cup sugar']), recipe('B', ['1/3 cup sugar']), recipe('C', ['1/3 cup sugar'])]))
      .toEqual({ sugar: '1 cup' });
  });

  it('sums volumes across units', () => {
    expect(shown([recipe('A', ['2 tbsp butter']), recipe('B', ['1/4 cup butter'])])).toEqual({ butter: '6 tbsp' });
  });

  it('keeps incompatible units on one line', () => {
    expect(shown([recipe('A', ['2 cloves garlic']), recipe('B', ['1 tbsp minced garlic'])])).toEqual({
      garlic: '2 cloves + 1 tbsp',
    });
    expect(shown([recipe('A', ['1 cup flour']), recipe('B', ['200 g flour'])])).toEqual({ flour: '1 cup + 7 oz' });
    expect(shown([recipe('A', ['1 cup flour']), recipe('B', ['200 g flour'])], 'metric')).toEqual({ flour: '237 ml + 200 g' });
  });

  it('never guesses between oz and fl oz', () => {
    expect(shown([recipe('A', ['8 oz milk']), recipe('B', ['1 cup milk'])])).toEqual({ milk: '8 oz + 1 cup' });
  });

  it('sums weights and converts per unit system', () => {
    const selections = [recipe('A', ['8 oz cream cheese']), recipe('B', ['4 oz cream cheese'])];
    expect(shown(selections)).toEqual({ 'cream cheese': '12 oz' });
    expect(shown(selections, 'metric')).toEqual({ 'cream cheese': '340 g' });
    expect(shown([recipe('A', ['500 g rice']), recipe('B', ['750 g rice'])], 'metric')).toEqual({ rice: '1.25 kg' });
  });

  it('keeps different package sizes apart', () => {
    expect(shown([recipe('A', ['1 (14 oz) can tomatoes']), recipe('B', ['1 (28 oz) can tomatoes'])]))
      .toEqual({ tomato: '1 can (14 oz) + 1 can (28 oz)' });
  });

  it('does not merge different items', () => {
    expect(shown([recipe('A', ['1 onion']), recipe('B', ['1 red onion'])])).toEqual({ onion: '1', 'red onion': '1' });
  });

  it('ignores size words when merging counts', () => {
    expect(shown([recipe('A', ['3 eggs']), recipe('B', ['2 large eggs'])])).toEqual({ egg: '5' });
  });

  it('sums ranges', () => {
    expect(shown([recipe('A', ['2-3 cloves garlic']), recipe('B', ['1 clove garlic'])])).toEqual({ garlic: '3-4 cloves' });
  });

  it('scales each recipe by its own target', () => {
    expect(shown([recipe('A', ['3 eggs'], 4, 6), recipe('B', ['1 cup milk'], 4, 6)])).toEqual({ egg: '5', milk: '1 1/2 cups' });
    expect(shown([recipe('A', ['1 (14 oz) can beans'], 4, 2)])).toEqual({ bean: '1 can (14 oz)' });
    expect(shown([recipe('A', ['a pinch of salt'], 4, 8)])).toEqual({ salt: '1 pinch' });
    expect(shown([recipe('A', ['1 tsp vanilla'], 4, 3)])).toEqual({ vanilla: '3/4 tsp' });
    expect(shown([recipe('A', ['1/4 tsp cayenne'], 8, 1)])).toEqual({ cayenne: 'pinch' });
  });

  it('puts pantry staples in the pantry group and keeps a to-taste line without an amount', () => {
    const items = build([recipe('A', ['Salt, to taste']), recipe('B', ['1 tsp salt'])], ['salt']);
    expect(items).toHaveLength(1);
    expect(items[0]?.group).toBe('pantry');
    expect(formatAmounts(items[0]?.amounts ?? [], 'us')).toBe('1 tsp');
  });

  it('records source recipes and skips headers', () => {
    const items = build([recipe('Tacos', ['For the sauce:', '1 onion']), recipe('Soup', ['2 onions'])]);
    expect(items).toHaveLength(1);
    expect(items[0]?.fromRecipes).toEqual(['Tacos', 'Soup']);
    expect(items[0]?.origin).toBe('recipe');
    expect(items[0]?.checked).toBe(false);
  });

  it('is deterministic', () => {
    const selections = [recipe('A', ['1 cup flour', '2 eggs', 'Salt, to taste']), recipe('B', ['1 egg', '1 tsp salt'])];
    expect(build(selections)).toEqual(build(selections));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/domain/merge.test.ts`
Expected: FAIL, import `./merge` cannot be resolved.

- [ ] **Step 3: Implement `src/domain/merge.ts`**

```ts
import { scaleLine } from './scale';
import type { Amount, IngredientLine, ListItem, Quantity } from './types';
import { dimensionOf, toBaseUnits } from './units';

export interface RecipeSelection {
  title: string;
  baseServings: number;
  targetServings: number;
  ingredients: IngredientLine[];
}

export interface BuildContext {
  pantryStaples: ReadonlySet<string>;
  classify: (itemKey: string) => string;
  makeId: () => string;
}

interface Group {
  name: string;
  buckets: Map<string, Amount>;
  notes: string[];
  fromRecipes: string[];
}

function addQuantities(a: Quantity, b: Quantity): Quantity {
  const min = a.min + b.min;
  if (a.max === undefined && b.max === undefined) return { min };
  return { min, max: (a.max ?? a.min) + (b.max ?? b.min) };
}

function toBucket(line: IngredientLine & { quantity: Quantity }): { key: string; amount: Amount } {
  const { quantity, unit, packageSize } = line;
  const dimension = dimensionOf(unit);
  if (unit !== undefined && (dimension === 'volume' || dimension === 'mass')) {
    const baseUnit = dimension === 'volume' ? 'ml' : 'g';
    const scaled: Quantity = quantity.max === undefined
      ? { min: toBaseUnits(quantity.min, unit) }
      : { min: toBaseUnits(quantity.min, unit), max: toBaseUnits(quantity.max, unit) };
    return { key: dimension, amount: { quantity: scaled, unit: baseUnit } };
  }
  if (unit === undefined) return { key: 'count', amount: { quantity } };
  const pkgKey = packageSize ? `${packageSize.quantity}${packageSize.unit}` : '';
  return {
    key: `other:${unit}:${pkgKey}`,
    amount: { quantity, unit, ...(packageSize ? { packageSize } : {}) },
  };
}

/**
 * Scales every selected recipe, groups lines by itemKey and sums compatible amounts.
 * Volume is summed in mL and mass in g; incompatible units stay as separate amounts.
 */
export function buildListItems(selections: RecipeSelection[], ctx: BuildContext): ListItem[] {
  const groups = new Map<string, Group>();

  for (const selection of selections) {
    for (const original of selection.ingredients) {
      if (original.isHeader || !original.itemKey) continue;
      const line = scaleLine(original, selection.baseServings, selection.targetServings);

      let group = groups.get(line.itemKey);
      if (!group) {
        group = { name: line.item, buckets: new Map(), notes: [], fromRecipes: [] };
        groups.set(line.itemKey, group);
      }
      if (!group.fromRecipes.includes(selection.title)) group.fromRecipes.push(selection.title);
      if (line.notes && !group.notes.includes(line.notes)) group.notes.push(line.notes);
      if (!line.quantity) continue;

      const { key, amount } = toBucket({ ...line, quantity: line.quantity });
      const existing = group.buckets.get(key);
      group.buckets.set(key, existing ? { ...existing, quantity: addQuantities(existing.quantity, amount.quantity) } : amount);
    }
  }

  return [...groups.entries()]
    .map(([key, group]): ListItem => ({
      id: ctx.makeId(),
      itemKey: key,
      name: group.name,
      amounts: [...group.buckets.values()],
      aisleId: ctx.classify(key),
      group: ctx.pantryStaples.has(key) ? 'pantry' : 'aisle',
      checked: false,
      origin: 'recipe',
      fromRecipes: group.fromRecipes,
      notes: group.notes.join('; '),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run src/domain/merge.test.ts && npm run typecheck`
Expected: PASS; `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/domain/merge.ts src/domain/merge.test.ts
git commit -m "feat(domain): merge scaled recipes into deterministic list items"
```

---

### Task 6: Aisles

**Files:**
- Create: `src/domain/aisles.ts`
- Test: `src/domain/aisles.test.ts`

**Interfaces:**
- Consumes: `parseIngredientLine` (tests only).
- Produces: `AisleDef { id; name }`, `OTHER_AISLE = 'other'`, `DEFAULT_AISLES: AisleDef[]` (ids: produce, meat-seafood, dairy-eggs, bakery, pantry, canned, spices-oils, frozen, beverages, household, other), `AISLE_DICTIONARY: Readonly<Record<string, string>>`, `classifyAisle(key: string, overrides: ReadonlyMap<string, string>, dictionary?): string`.

Lookup order: override, exact key, longest matching suffix ("smoked paprika" -> "paprika"), longest matching prefix ("chicken thigh" -> "chicken"), else `other`.

- [ ] **Step 1: Write the failing test `src/domain/aisles.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { AISLE_DICTIONARY, DEFAULT_AISLES, classifyAisle } from './aisles';
import { parseIngredientLine } from './parse';

const none = new Map<string, string>();

describe('classifyAisle', () => {
  it.each([
    ['onion', 'produce'],
    ['red onion', 'produce'],
    ['egg', 'dairy-eggs'],
    ['smoked paprika', 'spices-oils'],
    ['garlic powder', 'spices-oils'],
    ['boneless chicken thigh', 'meat-seafood'],
    ['chicken broth', 'canned'],
    ['olive oil', 'spices-oils'],
    ['diced tomato', 'canned'],
    ['tomato', 'produce'],
    ['dragon fruit leather', 'other'],
    ['', 'other'],
  ])('%s -> %s', (key, aisle) => {
    expect(classifyAisle(key, none)).toBe(aisle);
  });

  it('prefers an override', () => {
    expect(classifyAisle('onion', new Map([['onion', 'frozen']]))).toBe('frozen');
  });

  it('every dictionary aisle is a default aisle', () => {
    const ids = new Set(DEFAULT_AISLES.map((a) => a.id));
    for (const aisle of Object.values(AISLE_DICTIONARY)) expect(ids.has(aisle)).toBe(true);
  });

  it('has a useful starter dictionary', () => {
    expect(Object.keys(AISLE_DICTIONARY).length).toBeGreaterThan(250);
  });
});

describe('canned vs fresh', () => {
  it('keeps canned diced tomatoes out of produce', () => {
    const canned = parseIngredientLine('1 (14 oz) can diced tomatoes', 'a');
    const fresh = parseIngredientLine('2 tomatoes, diced', 'b');
    expect(classifyAisle(canned.itemKey, none)).toBe('canned');
    expect(classifyAisle(fresh.itemKey, none)).toBe('produce');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/domain/aisles.test.ts`
Expected: FAIL, import `./aisles` cannot be resolved.

- [ ] **Step 3: Implement `src/domain/aisles.ts`**

```ts
export interface AisleDef {
  id: string;
  name: string;
}

export const OTHER_AISLE = 'other';

export const DEFAULT_AISLES: AisleDef[] = [
  { id: 'produce', name: 'Produce' },
  { id: 'meat-seafood', name: 'Meat & Seafood' },
  { id: 'dairy-eggs', name: 'Dairy & Eggs' },
  { id: 'bakery', name: 'Bakery' },
  { id: 'pantry', name: 'Pantry & Dry Goods' },
  { id: 'canned', name: 'Canned & Jarred' },
  { id: 'spices-oils', name: 'Spices & Oils' },
  { id: 'frozen', name: 'Frozen' },
  { id: 'beverages', name: 'Beverages' },
  { id: 'household', name: 'Household' },
  { id: OTHER_AISLE, name: 'Other' },
];

/** Keys are itemKeys (lowercase, singular). Written for CartCraft; not derived from AGPL or ODbL sources. */
const BY_AISLE: Record<string, string[]> = {
  produce: [
    'apple', 'avocado', 'banana', 'basil', 'bean sprout', 'beet', 'bell pepper', 'berry', 'blackberry',
    'blueberry', 'bok choy', 'broccoli', 'brussels sprout', 'butternut squash', 'cabbage', 'cantaloupe',
    'carrot', 'cauliflower', 'celery', 'chard', 'cherry', 'chili', 'chive', 'cilantro', 'collard green',
    'corn', 'cranberry', 'cucumber', 'dill', 'eggplant', 'fennel', 'garlic', 'ginger', 'grape',
    'grapefruit', 'green bean', 'green onion', 'herb', 'jalapeño', 'jalapeno', 'kale', 'kiwi', 'leek',
    'lemon', 'lemongrass', 'lettuce', 'lime', 'mango', 'melon', 'mint', 'mushroom', 'onion', 'orange',
    'oregano leaf', 'parsley', 'parsnip', 'peach', 'pear', 'pea', 'pineapple', 'plum', 'potato',
    'pumpkin', 'radish', 'raspberry', 'red onion', 'romaine', 'rosemary', 'sage', 'scallion', 'shallot',
    'snap pea', 'spinach', 'squash', 'strawberry', 'sweet potato', 'thyme', 'tomato', 'watermelon',
    'yellow onion', 'zucchini', 'arugula', 'asparagus', 'salad green', 'serrano', 'poblano',
  ],
  'meat-seafood': [
    'bacon', 'beef', 'breast', 'brisket', 'chicken', 'chop', 'chorizo', 'cod', 'crab', 'drumstick',
    'fillet', 'fish', 'ground beef', 'ground pork', 'ground turkey', 'ham', 'lamb', 'lobster', 'mussel',
    'pancetta', 'pork', 'prosciutto', 'salami', 'salmon', 'sausage', 'scallop', 'shrimp', 'steak',
    'thigh', 'tilapia', 'tuna steak', 'turkey', 'veal', 'wing', 'anchovy fillet',
  ],
  'dairy-eggs': [
    'butter', 'buttermilk', 'cheddar', 'cheese', 'cottage cheese', 'cream', 'cream cheese', 'egg',
    'feta', 'goat cheese', 'greek yogurt', 'half and half', 'heavy cream', 'milk', 'mozzarella',
    'parmesan', 'ricotta', 'sour cream', 'whipping cream', 'yogurt', 'gruyere', 'mascarpone',
    'monterey jack', 'pecorino', 'swiss', 'creme fraiche', 'egg yolk', 'egg white',
  ],
  bakery: [
    'bagel', 'baguette', 'bread', 'brioche', 'bun', 'ciabatta', 'croissant', 'english muffin',
    'hamburger bun', 'naan', 'pita', 'roll', 'sourdough', 'tortilla', 'flatbread',
  ],
  pantry: [
    'all-purpose flour', 'almond', 'baking powder', 'baking soda', 'barley', 'breadcrumb',
    'brown sugar', 'bulgur', 'cashew', 'cereal', 'chickpea flour', 'chocolate', 'chocolate chip',
    'cocoa powder', 'cornmeal', 'cornstarch', 'couscous', 'cracker', 'flour', 'gram flour', 'granola',
    'honey', 'lentil', 'maple syrup', 'molasses', 'noodle', 'nut', 'oat', 'panko', 'pasta', 'peanut',
    'peanut butter', 'pecan', 'pine nut', 'powdered sugar', 'quinoa', 'raisin', 'rice', 'rolled oat',
    'sesame seed', 'spaghetti', 'sugar', 'superfine sugar', 'walnut', 'yeast', 'penne', 'macaroni',
    'egg noodle', 'ramen', 'tortilla chip', 'dried fruit', 'date', 'pistachio', 'hazelnut', 'chia seed',
    'flaxseed', 'vanilla', 'vanilla extract', 'extract', 'gelatin', 'corn syrup',
  ],
  canned: [
    'applesauce', 'bean', 'black bean', 'broth', 'chickpea', 'coconut milk', 'diced tomato',
    'kidney bean', 'pinto bean', 'stock', 'tomato paste', 'tomato sauce', 'crushed tomato', 'tuna',
    'salsa', 'sauce', 'soy sauce', 'fish sauce', 'hot sauce', 'worcestershire sauce', 'ketchup',
    'mustard', 'dijon mustard', 'mayonnaise', 'vinegar', 'balsamic vinegar', 'olive', 'caper',
    'pickle', 'jam', 'peanut sauce', 'pesto', 'curry paste', 'sriracha', 'anchovy', 'artichoke heart',
    'roasted red pepper', 'evaporated milk', 'condensed milk', 'sweetened condensed milk', 'bouillon',
    'hoisin sauce', 'oyster sauce', 'tahini', 'chipotle in adobo',
  ],
  'spices-oils': [
    'allspice', 'bay leaf', 'black pepper', 'canola oil', 'cardamom', 'cayenne', 'chili flake',
    'chili powder', 'cinnamon', 'clove', 'coconut oil', 'coriander', 'cumin', 'curry powder',
    'garlic powder', 'ground cinnamon', 'ground cumin', 'italian seasoning', 'kosher salt', 'nutmeg',
    'oil', 'olive oil', 'onion powder', 'oregano', 'paprika', 'pepper', 'peppercorn',
    'red pepper flake', 'salt', 'sea salt', 'seasoning', 'sesame oil', 'smoked paprika', 'turmeric',
    'vegetable oil', 'cooking spray', 'garam masala', 'ground ginger', 'mustard seed', 'fennel seed',
    'saffron', 'star anise', 'powder', 'spice', 'extra-virgin olive oil',
  ],
  frozen: [
    'frozen corn', 'frozen pea', 'frozen spinach', 'frozen berry', 'ice cream', 'frozen vegetable',
    'puff pastry', 'pie crust', 'frozen fruit', 'phyllo dough',
  ],
  beverages: [
    'beer', 'coffee', 'juice', 'orange juice', 'sparkling water', 'tea', 'wine', 'white wine',
    'red wine', 'soda', 'club soda', 'apple cider', 'water',
  ],
  household: [
    'aluminum foil', 'foil', 'paper towel', 'parchment paper', 'plastic wrap', 'trash bag',
    'dish soap', 'napkin', 'toothpick', 'skewer', 'zip bag',
  ],
};

export const AISLE_DICTIONARY: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(Object.entries(BY_AISLE).flatMap(([aisle, keys]) => keys.map((k) => [k, aisle]))),
);

/**
 * Override (user or cached LLM answer), then exact dictionary match, then the longest matching
 * suffix ("smoked paprika" -> "paprika"), then the longest matching prefix ("chicken thigh" ->
 * "chicken"), else Other.
 */
export function classifyAisle(
  key: string,
  overrides: ReadonlyMap<string, string>,
  dictionary: Readonly<Record<string, string>> = AISLE_DICTIONARY,
): string {
  if (!key) return OTHER_AISLE;
  const override = overrides.get(key);
  if (override) return override;
  const exact = dictionary[key];
  if (exact) return exact;
  const words = key.split(' ');
  for (let i = 1; i < words.length; i++) {
    const match = dictionary[words.slice(i).join(' ')];
    if (match) return match;
  }
  for (let i = words.length - 1; i > 0; i--) {
    const match = dictionary[words.slice(0, i).join(' ')];
    if (match) return match;
  }
  return OTHER_AISLE;
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run src/domain/aisles.test.ts && npm run typecheck`
Expected: PASS; `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/domain/aisles.ts src/domain/aisles.test.ts
git commit -m "feat(domain): add default aisles, starter dictionary and classifier"
```

---

### Task 7: Recipe yield, JSON-LD extraction and the public domain API

**Files:**
- Create: `src/domain/yield.ts`, `src/domain/jsonld.ts`, `src/domain/index.ts`
- Test: `src/domain/yield.test.ts`, `src/domain/jsonld.test.ts`

**Interfaces:**
- Consumes: `decodeEntities` (text.ts).
- Produces: `ParsedYield { servings?: number; yieldText?: string }`, `parseYield(value: unknown): ParsedYield`; `RecipeDraft { title; ingredients: string[]; servings?; yieldText?; sourceUrl }`, `extractRecipe(jsonLdBlocks: string[], pageUrl: string): RecipeDraft | null`; `src/domain/index.ts` re-exports the public API used by Plans 2 to 4.

- [ ] **Step 1: Write the failing tests**

`src/domain/yield.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseYield } from './yield';

describe('parseYield', () => {
  it.each([
    ['4', { servings: 4 }],
    [4, { servings: 4 }],
    ['Serves 4-6', { servings: 4, yieldText: 'Serves 4-6' }],
    ['4 servings', { servings: 4, yieldText: '4 servings' }],
    [['4', '4 servings'], { servings: 4 }],
    [['6', '24 cookies'], { servings: 6, yieldText: '24 cookies' }],
    ['24 cookies', { yieldText: '24 cookies' }],
    [undefined, {}],
    ['', {}],
    [0, {}],
    [{ value: 4 }, {}],
  ])('%j -> %j', (input, expected) => {
    expect(parseYield(input)).toEqual(expected);
  });
});
```

`src/domain/jsonld.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { extractRecipe } from './jsonld';

const URL = 'https://example.com/recipes/tacos';
const block = (data: unknown) => JSON.stringify(data);

describe('extractRecipe', () => {
  it('finds a top-level Recipe', () => {
    const draft = extractRecipe(
      [block({ '@type': 'Recipe', name: 'Tacos', recipeIngredient: ['1 lb beef', '8 tortillas'], recipeYield: '4' })],
      URL,
    );
    expect(draft).toEqual({ title: 'Tacos', ingredients: ['1 lb beef', '8 tortillas'], servings: 4, sourceUrl: URL });
  });

  it('finds a Recipe inside @graph', () => {
    const draft = extractRecipe(
      [block({ '@context': 'https://schema.org', '@graph': [{ '@type': 'WebPage' }, { '@type': 'Recipe', name: 'Soup', recipeIngredient: ['1 onion'] }] })],
      URL,
    );
    expect(draft?.title).toBe('Soup');
  });

  it('accepts @type arrays', () => {
    const draft = extractRecipe([block({ '@type': ['Recipe', 'NewsArticle'], name: 'Stew', recipeIngredient: ['1 carrot'] })], URL);
    expect(draft?.title).toBe('Stew');
  });

  it('follows mainEntity', () => {
    const draft = extractRecipe([block({ '@type': 'WebPage', mainEntity: { '@type': 'Recipe', name: 'Pie', recipeIngredient: ['1 apple'] } })], URL);
    expect(draft?.title).toBe('Pie');
  });

  it('finds a Recipe inside a top-level array', () => {
    const draft = extractRecipe([block([{ '@type': 'Organization' }, { '@type': 'Recipe', name: 'Salad', recipeIngredient: [] }])], URL);
    expect(draft?.title).toBe('Salad');
  });

  it('decodes double-encoded entities', () => {
    const draft = extractRecipe([block({ '@type': 'Recipe', name: 'Mac &amp;amp; Cheese', recipeIngredient: ['&amp;frac12; cup cream'] })], URL);
    expect(draft?.title).toBe('Mac & Cheese');
    expect(draft?.ingredients).toEqual(['½ cup cream']);
  });

  it('splits a single-string ingredient list and flattens nested arrays', () => {
    expect(extractRecipe([block({ '@type': 'Recipe', name: 'A', recipeIngredient: '1 cup flour\n2 eggs' })], URL)?.ingredients)
      .toEqual(['1 cup flour', '2 eggs']);
    expect(extractRecipe([block({ '@type': 'Recipe', name: 'B', recipeIngredient: [['1 cup flour'], ['2 eggs', '']] })], URL)?.ingredients)
      .toEqual(['1 cup flour', '2 eggs']);
  });

  it('reads PropertyValue ingredients', () => {
    const draft = extractRecipe([block({ '@type': 'Recipe', name: 'C', recipeIngredient: [{ '@type': 'PropertyValue', value: '1 cup rice' }] })], URL);
    expect(draft?.ingredients).toEqual(['1 cup rice']);
  });

  it('prefers the recipe matching the page url', () => {
    const draft = extractRecipe(
      [block([
        { '@type': 'Recipe', name: 'Other', url: 'https://example.com/recipes/other', recipeIngredient: [] },
        { '@type': 'Recipe', name: 'Tacos', url: 'https://example.com/recipes/tacos/', recipeIngredient: [] },
      ])],
      URL,
    );
    expect(draft?.title).toBe('Tacos');
  });

  it('falls back to the first recipe', () => {
    const draft = extractRecipe([block([{ '@type': 'Recipe', name: 'First' }, { '@type': 'Recipe', name: 'Second' }])], URL);
    expect(draft?.title).toBe('First');
  });

  it('reads yield arrays', () => {
    const draft = extractRecipe([block({ '@type': 'Recipe', name: 'Cookies', recipeYield: ['6', '24 cookies'] })], URL);
    expect(draft?.servings).toBe(6);
    expect(draft?.yieldText).toBe('24 cookies');
  });

  it('tolerates trailing commas and skips broken blocks', () => {
    const draft = extractRecipe(['{ not json', '{"@type": "Recipe", "name": "Ok", "recipeIngredient": ["1 egg",],}'], URL);
    expect(draft?.title).toBe('Ok');
    expect(draft?.ingredients).toEqual(['1 egg']);
  });

  it('returns null when there is no recipe', () => {
    expect(extractRecipe([block({ '@type': 'WebPage' })], URL)).toBeNull();
    expect(extractRecipe([], URL)).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/domain/yield.test.ts src/domain/jsonld.test.ts`
Expected: FAIL, imports `./yield` and `./jsonld` cannot be resolved.

- [ ] **Step 3: Implement `src/domain/yield.ts`**

```ts
export interface ParsedYield {
  servings?: number;
  yieldText?: string;
}

const SERVING_WORDS = /\b(serv(?:es|ings?)|people|persons?|portions?)\b/i;

function parseOne(value: unknown): { servings?: number; text?: string; isServing: boolean } {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? { servings: value, isServing: true } : { isServing: false };
  }
  if (typeof value !== 'string') return { isServing: false };
  const text = value.trim();
  if (!text) return { isServing: false };
  const first = /\d+(?:\.\d+)?/.exec(text);
  const n = first ? Number(first[0]) : undefined;
  if (/^\d+(?:\.\d+)?$/.test(text)) return { servings: n, isServing: true };
  if (n !== undefined && n > 0 && (SERVING_WORDS.test(text) || /^\d+\s*-\s*\d+$/.test(text))) {
    return { servings: n, text, isServing: true };
  }
  return { text, isServing: false };
}

/**
 * schema.org recipeYield is a number, a string, or an array such as ["6", "24 cookies"].
 * Ranges use the lower bound. Never defaults to 1.
 */
export function parseYield(value: unknown): ParsedYield {
  const parts = Array.isArray(value) ? value.map(parseOne) : [parseOne(value)];
  const servings = parts.find((p) => p.isServing && p.servings !== undefined)?.servings;
  const yieldText = Array.isArray(value)
    ? parts.find((p) => !p.isServing && p.text)?.text
    : parts[0]?.text;
  return {
    ...(servings !== undefined ? { servings } : {}),
    ...(yieldText ? { yieldText } : {}),
  };
}
```

- [ ] **Step 4: Implement `src/domain/jsonld.ts`**

```ts
import { decodeEntities } from './text';
import { parseYield } from './yield';

export interface RecipeDraft {
  title: string;
  ingredients: string[];
  servings?: number;
  yieldText?: string;
  sourceUrl: string;
}

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function tolerantParse(block: string): unknown {
  try {
    return JSON.parse(block);
  } catch {
    try {
      return JSON.parse(block.replace(/,\s*([}\]])/g, '$1'));
    } catch {
      return undefined;
    }
  }
}

function isRecipe(node: JsonObject): boolean {
  const type = node['@type'];
  const types = Array.isArray(type) ? type : [type];
  return types.some((t) => typeof t === 'string' && /(?:^|[:/])Recipe$/.test(t));
}

function collectRecipes(node: unknown, found: JsonObject[], depth = 0): void {
  if (depth > 8) return;
  if (Array.isArray(node)) {
    for (const child of node) collectRecipes(child, found, depth + 1);
    return;
  }
  if (!isObject(node)) return;
  if (isRecipe(node)) found.push(node);
  if (node['@graph'] !== undefined) collectRecipes(node['@graph'], found, depth + 1);
  if (node.mainEntity !== undefined) collectRecipes(node.mainEntity, found, depth + 1);
}

function normalizeUrl(url: unknown): string | undefined {
  if (typeof url !== 'string') return undefined;
  return url.replace(/#.*$/, '').replace(/\/+$/, '').toLowerCase();
}

function flattenIngredients(value: unknown): string[] {
  if (typeof value === 'string') return value.split(/\r?\n/);
  if (Array.isArray(value)) return value.flatMap(flattenIngredients);
  if (isObject(value)) {
    const inner = value.value ?? value.name ?? value.text;
    return typeof inner === 'string' ? [inner] : [];
  }
  return [];
}

function clean(s: string): string {
  return decodeEntities(s).replace(/\s+/g, ' ').trim();
}

/**
 * Finds a schema.org Recipe in the page's JSON-LD blocks. Handles arrays, @graph, mainEntity,
 * @type arrays, nested or single-string ingredient lists, and double-encoded entities.
 * When several recipes are present, prefers the one whose url or @id matches the page.
 */
export function extractRecipe(jsonLdBlocks: string[], pageUrl: string): RecipeDraft | null {
  const recipes: JsonObject[] = [];
  for (const block of jsonLdBlocks) collectRecipes(tolerantParse(block), recipes);
  if (recipes.length === 0) return null;

  const page = normalizeUrl(pageUrl);
  const recipe =
    recipes.find((r) => normalizeUrl(r.url) === page || normalizeUrl(r['@id']) === page) ?? recipes[0];
  if (!recipe) return null;

  const ingredients = flattenIngredients(recipe.recipeIngredient ?? recipe.ingredients)
    .map(clean)
    .filter(Boolean);
  const title = typeof recipe.name === 'string' && clean(recipe.name) ? clean(recipe.name) : 'Untitled recipe';
  const { servings, yieldText } = parseYield(recipe.recipeYield ?? recipe.yield);

  return {
    title,
    ingredients,
    ...(servings !== undefined ? { servings } : {}),
    ...(yieldText ? { yieldText: clean(yieldText) } : {}),
    sourceUrl: pageUrl,
  };
}
```

- [ ] **Step 5: Create `src/domain/index.ts`**

```ts
export type * from './types';
export { AISLE_DICTIONARY, DEFAULT_AISLES, OTHER_AISLE, classifyAisle, type AisleDef } from './aisles';
export { formatAmount, formatAmounts } from './format';
export { itemKey } from './itemKey';
export { extractRecipe, type RecipeDraft } from './jsonld';
export { buildListItems, type BuildContext, type RecipeSelection } from './merge';
export { parseIngredientLine } from './parse';
export { scaleLine } from './scale';
export { lookupUnit, unitLabel } from './units';
export { parseYield, type ParsedYield } from './yield';
```

- [ ] **Step 6: Run the whole suite, typecheck and the existing build**

Run: `npm test && npm run typecheck && npm run build`
Expected: every test file under `src/domain/` PASSES (196 tests), `tsc` prints nothing, and `vite build` ends with "built in".

- [ ] **Step 7: Commit**

```bash
git add src/domain/yield.ts src/domain/yield.test.ts src/domain/jsonld.ts src/domain/jsonld.test.ts src/domain/index.ts
git commit -m "feat(domain): parse recipe yields, extract JSON-LD recipes, export domain API"
```

---

## Done when

- `npm test` passes all 196 domain tests.
- `npm run typecheck` is clean with `strict` and `noUncheckedIndexedAccess`.
- `npm run build` still succeeds (the old UI is untouched).
- `src/domain/` has no imports outside `./*`, `numeric-quantity` and `pluralize` (check: `grep -rhE "^import .* from '" src/domain | grep -vE "from '\./|numeric-quantity|pluralize|vitest"` prints nothing).

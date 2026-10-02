# Settings Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Settings into a calm home page of rows that each open their own page, swap the aisle line icons for emoji, and move the list header actions into a ⋯ menu.

**Architecture:** Pure UI change plus one app function (`moveAisleTo`). Each settings page is its own component under `src/ui/screens/settings/` with its own route (`/settings/<page>`). The old `SettingsScreen` keeps working until Task 10 replaces it with the home page, so every task leaves the app and the test suite green.

**Tech Stack:** React 19, React Router 7, Dexie 4 + dexie-react-hooks, Tailwind CSS 4.3, lucide-react, Vitest 3 + Testing Library (jsdom 26), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-02-settings-redesign-design.md`

## Global Constraints

- Do not use em dashes in code comments, docs or UI copy.
- Every user-visible change adds a line under `## [Unreleased]` in `CHANGELOG.md` (in a `### Changed` group; create the group heading if it is not there yet) in the same commit.
- No hex colors or arbitrary color values in JSX. Use the `slate`, `emerald`, `amber`, `red` ramps or the `tint-*` tokens via `TINT_CLASS` from `src/ui/tints.ts`.
- CSP is `style-src 'self'`: no `<style>` tags. React's `style` prop is allowed only for the drag offsets of aisle rows (Task 6) and the existing progress bar.
- Emoji, Lucide icons and badges are decorative: `aria-hidden="true"`.
- UI test files start with `// @vitest-environment jsdom`.
- Run commands from `C:\Users\misha\cartcraft` in Git Bash. One test file: `npx vitest run <path>`. Everything: `npm test` and `npm run typecheck`.
- Commit messages end with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` after a blank line.
- The ingredient parser fixes and AI error messages are NOT part of this plan.

## File Structure

| File | Responsibility |
|---|---|
| `src/app/settings.ts` (modify) | `moveAisleTo` |
| `src/ui/aisleIcons.ts` (modify) | emoji and tint per aisle id |
| `src/ui/components/AisleBadge.tsx` (modify) | emoji on a tinted square |
| `src/ui/components/Menu.tsx` (create) | ⋯ menu button, `MenuItem`, `MenuCheckbox` |
| `src/ui/screens/ListScreen.tsx` (modify) | header uses `Menu`; AI link goes to `/settings/ai` |
| `src/ui/hooks.ts` (modify) | `useStorageUsage` |
| `src/ui/screens/settings/SettingsPage.tsx` (create) | back link, title, hint; shared card class strings |
| `src/ui/screens/settings/SettingsRow.tsx` (create) | one home row: badge, name, summary, value, chevron |
| `src/ui/screens/settings/ChoiceList.tsx` (create) | radio choices styled as ticked rows |
| `src/ui/screens/settings/AppearancePage.tsx` (create) | theme |
| `src/ui/screens/settings/UnitsPage.tsx` (create) | unit system |
| `src/ui/screens/settings/ServingsPage.tsx` (create) | default servings stepper |
| `src/ui/screens/settings/aisleDrag.ts` (create) | pure drop-index and row-shift math |
| `src/ui/screens/settings/AislesPage.tsx` (create) | rename, drag and keyboard reorder |
| `src/ui/screens/settings/PantryPage.tsx` (create) | pantry staples |
| `src/ui/screens/settings/StoragePage.tsx` (create) | usage, protection, version |
| `src/ui/components/AiSettings.tsx` (modify) | provider tick list, key card |
| `src/ui/screens/settings/AiPage.tsx` (create) | page wrapper for `AiSettings` |
| `src/ui/screens/settings/BackupPage.tsx` (create) | export, share, import, paste, undo |
| `src/ui/screens/settings/summaries.ts` (create) | summary strings for home rows |
| `src/ui/screens/SettingsScreen.tsx` (rewrite) | Settings home |
| `src/ui/App.tsx` (modify) | settings routes |
| `src/ui/screens/RecipeEditorScreen.tsx` (modify) | AI link goes to `/settings/ai` |
| `e2e/backup.spec.ts` (modify) | new settings paths and names |

---

### Task 1: `moveAisleTo`

**Files:**
- Modify: `src/app/settings.ts`
- Test: `src/app/settings.test.ts`

**Interfaces:**
- Produces: `moveAisleTo(db: CartCraftDb, id: string, index: number): Promise<void>` from `src/app/settings.ts`. Moves the aisle to `index` (rounded, clamped to `0..count-1`) and renumbers every aisle's `order` to `0..count-1`. No-op for an unknown id.

- [ ] **Step 1: Write the failing test**

In `src/app/settings.test.ts`, change the import line to:

```ts
import { addPantryStaple, moveAisle, moveAisleTo, removePantryStaple, renameAisle } from './settings';
```

Add inside `describe('aisles', ...)`, after the `does nothing at the ends` test:

```ts
  it('moves an aisle to a position and renumbers the order', async () => {
    const db = createTestDb();
    await moveAisleTo(db, 'frozen', 0);
    expect((await order(db)).slice(0, 3)).toEqual(['frozen', 'produce', 'meat-seafood']);
    const orders = (await db.aisles.orderBy('order').toArray()).map((a) => a.order);
    expect(orders).toEqual(orders.map((_, i) => i));
  });

  it('moves an aisle down past later aisles', async () => {
    const db = createTestDb();
    await moveAisleTo(db, 'produce', 2);
    expect((await order(db)).slice(0, 3)).toEqual(['meat-seafood', 'dairy-eggs', 'produce']);
  });

  it('clamps the position and ignores unknown aisles', async () => {
    const db = createTestDb();
    await moveAisleTo(db, 'produce', 99);
    expect((await order(db)).at(-1)).toBe('produce');
    const before = await order(db);
    await moveAisleTo(db, 'no-such-aisle', 0);
    await moveAisleTo(db, 'frozen', -5);
    expect((await order(db))[0]).toBe('frozen');
    expect((await order(db)).filter((id) => id !== 'frozen')).toEqual(before.filter((id) => id !== 'frozen'));
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/settings.test.ts`
Expected: FAIL, `moveAisleTo` is not exported (`moveAisleTo is not a function`).

- [ ] **Step 3: Write minimal implementation**

Append to `src/app/settings.ts`:

```ts
/** Moves an aisle to a position in the shopping order (clamped) and renumbers every aisle. No-op for an unknown id. */
export async function moveAisleTo(db: CartCraftDb, id: string, index: number): Promise<void> {
  await db.transaction('rw', db.aisles, async () => {
    const aisles = await db.aisles.orderBy('order').toArray();
    const from = aisles.findIndex((a) => a.id === id);
    if (from < 0) return;
    const [moved] = aisles.splice(from, 1);
    const to = Math.min(Math.max(0, Math.round(index)), aisles.length);
    aisles.splice(to, 0, moved!);
    await db.aisles.bulkPut(aisles.map((a, order) => ({ ...a, order })));
  });
}
```

(`order` is a plain index, not unique, so renumbering in one `bulkPut` is safe.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/settings.test.ts`
Expected: PASS, all aisle and pantry tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/settings.ts src/app/settings.test.ts
git commit -m "feat(settings): move an aisle to any position

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Emoji aisle badges

**Files:**
- Modify: `src/ui/aisleIcons.ts`
- Modify: `src/ui/components/AisleBadge.tsx`
- Test: `src/ui/aisleIcons.test.ts` (rewrite)
- Test: `src/ui/screens/ListScreens.test.tsx:40-47`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Produces: `aisleEmoji(aisleId: string): string`, `aisleTint(aisleId: string): Tint`, `PANTRY_CHECK_ID = 'check-pantry'` from `src/ui/aisleIcons.ts`. `aisleIcon` is removed. `<AisleBadge aisleId={string} size?: 'sm' | 'md' />` keeps its props and `data-aisle-badge` attribute; it now renders the emoji as text.

- [ ] **Step 1: Write the failing tests**

Replace `src/ui/aisleIcons.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_AISLES } from '../domain';
import { PANTRY_CHECK_ID, aisleEmoji, aisleTint } from './aisleIcons';
import { TINT_CLASS } from './tints';

describe('aisle emoji and tints', () => {
  it('gives known aisles their own emoji and tint', () => {
    expect(aisleEmoji('produce')).toBe('🥕');
    expect(aisleEmoji('meat-seafood')).toBe('🥩');
    expect(aisleEmoji('dairy-eggs')).toBe('🥛');
    expect(aisleTint('produce')).toBe('green');
    expect(aisleTint('meat-seafood')).toBe('red');
  });

  it('gives the pantry check section a jar', () => {
    expect(aisleEmoji(PANTRY_CHECK_ID)).toBe('🫙');
    expect(aisleTint(PANTRY_CHECK_ID)).toBe('gray');
  });

  it('falls back to a grey cart for Other and unknown aisles', () => {
    expect(aisleEmoji('other')).toBe('🛒');
    expect(aisleEmoji('my-custom-aisle')).toBe('🛒');
    expect(aisleTint('my-custom-aisle')).toBe('gray');
  });

  it('has an emoji and a tint class for every default aisle', () => {
    for (const aisle of DEFAULT_AISLES) {
      expect(aisleEmoji(aisle.id)).not.toBe('');
      expect(TINT_CLASS[aisleTint(aisle.id)]).toMatch(/^bg-tint-/);
    }
  });
});
```

In `src/ui/screens/ListScreens.test.tsx`, replace the test `shows an icon badge on every aisle section and the pantry section` with:

```tsx
  it('shows an emoji badge on every aisle section and the pantry section', async () => {
    const { db, listId } = await seededList();
    renderRoutes(routes, `/lists/${listId}`, db);
    for (const [name, emoji] of [['Produce', '🥕'], ['Dairy & Eggs', '🥛'], ['Check pantry', '🫙']] as const) {
      const region = await screen.findByRole('region', { name });
      expect(region.querySelector('[data-aisle-badge]')).toHaveTextContent(emoji);
    }
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/ui/aisleIcons.test.ts src/ui/screens/ListScreens.test.tsx`
Expected: FAIL, `aisleEmoji` is not exported, and the badge has no emoji text.

- [ ] **Step 3: Implement**

Replace `src/ui/aisleIcons.ts` with:

```ts
import type { Tint } from './tints';

/** Section id for the "Check pantry" group. Not a real aisle, so it cannot clash with one. */
export const PANTRY_CHECK_ID = 'check-pantry';

const BY_AISLE: Record<string, { emoji: string; tint: Tint }> = {
  produce: { emoji: '🥕', tint: 'green' },
  'meat-seafood': { emoji: '🥩', tint: 'red' },
  'dairy-eggs': { emoji: '🥛', tint: 'blue' },
  bakery: { emoji: '🥐', tint: 'amber' },
  pantry: { emoji: '🌾', tint: 'orange' },
  canned: { emoji: '🥫', tint: 'teal' },
  'spices-oils': { emoji: '🫒', tint: 'rose' },
  frozen: { emoji: '🧊', tint: 'sky' },
  beverages: { emoji: '🥤', tint: 'purple' },
  household: { emoji: '🧻', tint: 'gray' },
  [PANTRY_CHECK_ID]: { emoji: '🫙', tint: 'gray' },
};

/** Emoji for an aisle id. Other and any aisle id this app does not know get a cart. */
export function aisleEmoji(aisleId: string): string {
  return BY_AISLE[aisleId]?.emoji ?? '🛒';
}

/** Badge tint for an aisle id. Other and unknown aisles are grey. */
export function aisleTint(aisleId: string): Tint {
  return BY_AISLE[aisleId]?.tint ?? 'gray';
}
```

Replace `src/ui/components/AisleBadge.tsx` with:

```tsx
import { aisleEmoji, aisleTint } from '../aisleIcons';
import { TINT_CLASS } from '../tints';

const SIZE = {
  sm: 'h-5 w-5 rounded-md text-xs',
  md: 'h-7 w-7 rounded-lg text-base',
} as const;

/** The aisle's emoji on its tinted square. Decorative: the aisle name is always next to it. */
export function AisleBadge({ aisleId, size = 'md' }: { aisleId: string; size?: 'sm' | 'md' }) {
  return (
    <span
      aria-hidden="true"
      data-aisle-badge={aisleId}
      className={`inline-flex shrink-0 items-center justify-center leading-none ${SIZE[size]} ${TINT_CLASS[aisleTint(aisleId)]}`}
    >
      {aisleEmoji(aisleId)}
    </span>
  );
}
```

Add under `## [Unreleased]` in `CHANGELOG.md`:

```markdown
### Changed
- Aisles on shopping lists show a food emoji (🥕 🥩 🥛 🥐 ...) on their coloured badge instead of a line icon.
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run src/ui/aisleIcons.test.ts src/ui/screens/ListScreens.test.tsx && npm run typecheck`
Expected: PASS, and no type errors (nothing else imported `aisleIcon`).

- [ ] **Step 5: Commit**

```bash
git add src/ui/aisleIcons.ts src/ui/aisleIcons.test.ts src/ui/components/AisleBadge.tsx src/ui/screens/ListScreens.test.tsx CHANGELOG.md
git commit -m "feat(ui): emoji aisle badges

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: ⋯ menu on the list

**Files:**
- Create: `src/ui/components/Menu.tsx`
- Test: `src/ui/components/Menu.test.tsx`
- Modify: `src/ui/screens/ListScreen.tsx` (imports, header at lines ~146-176)
- Test: `src/ui/screens/ListScreens.test.tsx`, `src/ui/screens/ListErrors.test.tsx`, `src/ui/screens/ListWakeLock.test.tsx`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Produces from `src/ui/components/Menu.tsx`:
  - `<Menu label={string}>{children}</Menu>`: a ⋯ button (`aria-label={label}`, `aria-haspopup="menu"`, `aria-expanded`) that opens a `role="menu"` card under it.
  - `<MenuItem icon={string} onSelect={() => void}>{text}</MenuItem>`: `role="menuitem"`; closes the menu, then calls `onSelect`.
  - `<MenuCheckbox icon={string} checked={boolean} onChange={(checked: boolean) => void}>{text}</MenuCheckbox>`: `role="menuitemcheckbox"` with `aria-checked`, a switch on the right; does not close the menu.

- [ ] **Step 1: Write the failing Menu tests**

Create `src/ui/components/Menu.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Menu, MenuCheckbox, MenuItem } from './Menu';

function Harness({ onRename = () => undefined }: { onRename?: () => void }) {
  const [on, setOn] = useState(false);
  return (
    <>
      <Menu label="List options">
        <MenuItem icon="✏️" onSelect={onRename}>Rename list</MenuItem>
        <MenuItem icon="📋" onSelect={() => undefined}>Copy list as text</MenuItem>
        <MenuCheckbox icon="☀️" checked={on} onChange={setOn}>Keep screen on</MenuCheckbox>
      </Menu>
      <p>Outside</p>
    </>
  );
}

describe('Menu', () => {
  it('opens on click and focuses the first item', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const button = screen.getByRole('button', { name: 'List options' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menu', { name: 'List options' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Rename list' })).toHaveFocus();
  });

  it('runs an item and closes', async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    render(<Harness onRename={onRename} />);
    await user.click(screen.getByRole('button', { name: 'List options' }));
    await user.click(screen.getByRole('menuitem', { name: 'Rename list' }));
    expect(onRename).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('toggles a checkbox item and stays open', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'List options' }));
    const toggle = screen.getByRole('menuitemcheckbox', { name: 'Keep screen on' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await user.click(toggle);
    expect(screen.getByRole('menuitemcheckbox', { name: 'Keep screen on' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('moves focus with the arrow keys and wraps', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'List options' }));
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Copy list as text' })).toHaveFocus();
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Rename list' })).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('menuitemcheckbox', { name: 'Keep screen on' })).toHaveFocus();
  });

  it('closes on Escape and returns focus to the button', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const button = screen.getByRole('button', { name: 'List options' });
    await user.click(button);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it('closes on a click outside', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'List options' }));
    await user.click(screen.getByText('Outside'));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes when the button is clicked again', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const button = screen.getByRole('button', { name: 'List options' });
    await user.click(button);
    await user.click(button);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/ui/components/Menu.test.tsx`
Expected: FAIL, cannot resolve `./Menu`.

- [ ] **Step 3: Implement `Menu`**

Create `src/ui/components/Menu.tsx`:

```tsx
import { MoreHorizontal } from 'lucide-react';
import {
  createContext, useCallback, useContext, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode,
} from 'react';

const CloseMenu = createContext<() => void>(() => undefined);

const ITEM = 'flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left text-sm text-slate-800 hover:bg-slate-50 focus:bg-slate-100 focus:outline-none';
const ITEMS = '[role="menuitem"],[role="menuitemcheckbox"]';

/** A ⋯ button that opens a small menu card. Escape or a click outside closes it. */
export function Menu({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    if (returnFocus) button.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>(ITEMS)?.focus();
    const onPointerDown = (e: PointerEvent | MouseEvent) => {
      const target = e.target as Node;
      if (!menu.current?.contains(target) && !button.current?.contains(target)) close(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, close]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(menu.current?.querySelectorAll<HTMLElement>(ITEMS) ?? [])];
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[(index + 1) % items.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[(index - 1 + items.length) % items.length]?.focus();
    } else if (e.key === 'Tab') {
      close(false);
    }
  };

  return (
    <div className="relative">
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        className="rounded-xl bg-slate-100 p-2 text-slate-600 hover:bg-slate-200"
      >
        <MoreHorizontal size={18} aria-hidden="true" />
      </button>
      {open && (
        <div
          ref={menu}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onKeyDown}
          className="absolute right-0 top-full z-40 mt-2 w-64 overflow-hidden rounded-2xl bg-white py-1 shadow-lg ring-1 ring-slate-200"
        >
          <CloseMenu.Provider value={close}>{children}</CloseMenu.Provider>
        </div>
      )}
    </div>
  );
}

/** A menu action. Closes the menu first, so a dialog it opens gets focus. */
export function MenuItem({ icon, onSelect, children }: { icon: string; onSelect: () => void; children: ReactNode }) {
  const close = useContext(CloseMenu);
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      className={ITEM}
      onClick={() => {
        close();
        onSelect();
      }}
    >
      <span aria-hidden="true">{icon}</span>
      {children}
    </button>
  );
}

/** An on/off menu item with a switch. Stays open so the change is visible. */
export function MenuCheckbox({ icon, checked, onChange, children }: {
  icon: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <button type="button" role="menuitemcheckbox" aria-checked={checked} tabIndex={-1} className={ITEM} onClick={() => onChange(!checked)}>
      <span aria-hidden="true">{icon}</span>
      <span className="flex-1">{children}</span>
      <span aria-hidden="true" className={`relative h-5 w-9 shrink-0 rounded-full ${checked ? 'bg-emerald-700' : 'bg-slate-300'}`}>
        <span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : ''}`} />
      </span>
    </button>
  );
}
```

- [ ] **Step 4: Run Menu tests**

Run: `npx vitest run src/ui/components/Menu.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 5: Update the list tests to go through the menu**

In `src/ui/screens/ListScreens.test.tsx`, add this helper after `seededList`:

```tsx
async function openListMenu(user: { click: (el: Element) => Promise<void> }) {
  await user.click(await screen.findByRole('button', { name: 'List options' }));
}
```

Then:
- In `renames the list in an in-app dialog, not a browser prompt` and `cancelling the rename dialog changes nothing`, replace `await user.click(await screen.findByRole('button', { name: 'Rename list' }));` with:

```tsx
    await openListMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Rename list' }));
```

- In `copies the list as text`, replace `await user.click(await screen.findByRole('button', { name: 'Copy list as text' }));` with:

```tsx
    await openListMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Copy list as text' }));
```

In `src/ui/screens/ListErrors.test.tsx`, in `explains a failed copy and clears the copied note after a while`, replace the two copy clicks:

```tsx
    await user.click(await screen.findByRole('button', { name: 'List options' }));
    await user.click(screen.getByRole('menuitem', { name: 'Copy list as text' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not copy.');

    writeText.mockResolvedValueOnce();
    await user.click(screen.getByRole('button', { name: 'List options' }));
    await user.click(screen.getByRole('menuitem', { name: 'Copy list as text' }));
```

Replace the two tests in `src/ui/screens/ListWakeLock.test.tsx` with:

```tsx
  it('is not in the list menu when the browser has no Screen Wake Lock', async () => {
    const { db, listId } = await seededList();
    const { user } = renderRoutes(routes, `/lists/${listId}`, db);
    await user.click(await screen.findByRole('button', { name: 'List options' }));
    expect(screen.getByRole('menuitem', { name: 'Rename list' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitemcheckbox', { name: 'Keep screen on' })).toBeNull();
  });

  it('saves the setting from the list menu and holds the wake lock while on', async () => {
    const request = vi.fn(async () => ({ released: false, release: vi.fn(async () => undefined) }));
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
    const { db, listId } = await seededList();
    const { user } = renderRoutes(routes, `/lists/${listId}`, db);
    await user.click(await screen.findByRole('button', { name: 'List options' }));
    const toggle = screen.getByRole('menuitemcheckbox', { name: 'Keep screen on' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(request).not.toHaveBeenCalled();
    await user.click(toggle);
    await waitFor(async () => expect((await getSettings(db)).keepScreenOn).toBe(true));
    await waitFor(() => expect(request).toHaveBeenCalledWith('screen'));
    expect(screen.getByRole('menuitemcheckbox', { name: 'Keep screen on' })).toHaveAttribute('aria-checked', 'true');
  });
```

- [ ] **Step 6: Run list tests to verify they fail**

Run: `npx vitest run src/ui/screens/ListScreens.test.tsx src/ui/screens/ListErrors.test.tsx src/ui/screens/ListWakeLock.test.tsx`
Expected: FAIL, no button named "List options".

- [ ] **Step 7: Use the menu in `ListScreen`**

In `src/ui/screens/ListScreen.tsx`:
- Change the lucide import to `import { Plus, Sparkles } from 'lucide-react';`
- Add `import { Menu, MenuCheckbox, MenuItem } from '../components/Menu';` after the `ListItemRow` import.
- Replace the whole `<div className="flex shrink-0 gap-1">...</div>` block (the Rename and Copy buttons) with:

```tsx
          <div className="shrink-0">
            <Menu label="List options">
              <MenuItem icon="✏️" onSelect={() => setRenaming(true)}>Rename list</MenuItem>
              <MenuItem icon="📋" onSelect={() => void copy.run(listAsText(list.name, list.items, aisles, settings.unitSystem))}>
                Copy list as text
              </MenuItem>
              {canWakeLock && (
                <MenuCheckbox
                  icon="☀️"
                  checked={settings.keepScreenOn}
                  onChange={(on) => void act.run(() => updateSettings(db, { keepScreenOn: on }))}
                >
                  Keep screen on
                </MenuCheckbox>
              )}
            </Menu>
          </div>
```

- Delete the `{canWakeLock && (<label ...> ... Keep screen on</label>)}` block that sits after the `<ProgressBar ... />` wrapper.

Add to the `### Changed` group under `## [Unreleased]` in `CHANGELOG.md`:

```markdown
- Rename list, Copy list as text and Keep screen on moved into a ⋯ menu at the top of a shopping list.
```

- [ ] **Step 8: Run tests and typecheck**

Run: `npx vitest run src/ui/components/Menu.test.tsx src/ui/screens/ListScreens.test.tsx src/ui/screens/ListErrors.test.tsx src/ui/screens/ListWakeLock.test.tsx src/ui/screens/ListAi.test.tsx && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 9: Commit**

```bash
git add src/ui/components/Menu.tsx src/ui/components/Menu.test.tsx src/ui/screens/ListScreen.tsx src/ui/screens/ListScreens.test.tsx src/ui/screens/ListErrors.test.tsx src/ui/screens/ListWakeLock.test.tsx CHANGELOG.md
git commit -m "feat(ui): list actions in a menu

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Settings building blocks

**Files:**
- Create: `src/ui/screens/settings/SettingsPage.tsx`
- Create: `src/ui/screens/settings/SettingsRow.tsx`
- Create: `src/ui/screens/settings/ChoiceList.tsx`
- Modify: `src/ui/hooks.ts`
- Test: `src/ui/screens/settings/parts.test.tsx`

**Interfaces:**
- Produces from `SettingsPage.tsx`:
  - `CARD = 'overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200'`
  - `CARD_LIST = \`${CARD} divide-y divide-slate-100\``
  - `GROUP_LABEL = 'mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500'`
  - `<SettingsPage title={string} hint?={ReactNode}>{children}</SettingsPage>`: back link (accessible name "Back to Settings", href `/settings`), `h1` title, optional hint paragraph.
- Produces from `SettingsRow.tsx`: `<SettingsRow to={string} emoji={string} tint={Tint} title={string} summary?={string} value?={string} />`, renders an `<li>` with one link. Its accessible name is the title, then the summary, then the value.
- Produces from `ChoiceList.tsx`: `<ChoiceList<T extends string> name={string} legend={string} showLegend?={boolean} choices={{ value: T; label: string; hint?: string }[]} value={T} onChange={(value: T) => void} />`. Each choice is a radio input (visually hidden) inside a row; the chosen row shows a tick. The radio's accessible name is the label followed by the hint.
- Produces from `src/ui/hooks.ts`: `useStorageUsage(): string | null`, for example `"2.1 MB"`. It is `null` until the browser answers, or when it can't.

- [ ] **Step 1: Write the failing tests**

Create `src/ui/screens/settings/parts.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useStorageUsage } from '../../hooks';
import { ChoiceList } from './ChoiceList';
import { SettingsPage } from './SettingsPage';
import { SettingsRow } from './SettingsRow';

afterEach(() => {
  Reflect.deleteProperty(navigator, 'storage');
});

describe('SettingsPage', () => {
  it('has a back link, a title and a hint', () => {
    render(<MemoryRouter><SettingsPage title="Units" hint="Pick one.">body</SettingsPage></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Back to Settings' })).toHaveAttribute('href', '/settings');
    expect(screen.getByRole('heading', { level: 1, name: 'Units' })).toBeInTheDocument();
    expect(screen.getByText('Pick one.')).toBeInTheDocument();
    expect(screen.getByText('body')).toBeInTheDocument();
  });
});

describe('SettingsRow', () => {
  it('links to its page and shows the summary and value', () => {
    render(
      <MemoryRouter>
        <ul><SettingsRow to="/settings/units" emoji="⚖️" tint="blue" title="Units" summary="How amounts show" value="US" /></ul>
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: /^Units/ });
    expect(link).toHaveAttribute('href', '/settings/units');
    expect(link).toHaveTextContent('How amounts show');
    expect(link).toHaveTextContent('US');
  });
});

describe('ChoiceList', () => {
  it('ticks the chosen row and reports a new choice', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ChoiceList
        name="units"
        legend="Unit system"
        choices={[{ value: 'us', label: 'US', hint: 'cups, oz, lb' }, { value: 'metric', label: 'Metric', hint: 'ml, g, kg' }]}
        value="us"
        onChange={onChange}
      />,
    );
    expect(screen.getByRole('group', { name: 'Unit system' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /^US/ })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: /^Metric/ }));
    expect(onChange).toHaveBeenCalledWith('metric');
  });
});

describe('useStorageUsage', () => {
  it('formats what the browser reports in megabytes', async () => {
    Object.defineProperty(navigator, 'storage', { value: { estimate: async () => ({ usage: 2.1 * 1024 * 1024 }) }, configurable: true });
    const { result } = renderHook(() => useStorageUsage());
    await waitFor(() => expect(result.current).toBe('2.1 MB'));
  });

  it('stays null when the browser cannot tell', () => {
    const { result } = renderHook(() => useStorageUsage());
    expect(result.current).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/ui/screens/settings/parts.test.tsx`
Expected: FAIL, cannot resolve `./ChoiceList` and `useStorageUsage` is not exported.

- [ ] **Step 3: Implement**

Create `src/ui/screens/settings/SettingsPage.tsx`:

```tsx
import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

export const CARD = 'overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200';
export const CARD_LIST = `${CARD} divide-y divide-slate-100`;
export const GROUP_LABEL = 'mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500';

/** The frame of every settings page: a way back, the title and an optional hint. */
export function SettingsPage({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <Link to="/settings" aria-label="Back to Settings" className="inline-flex items-center text-sm font-medium text-emerald-800 hover:underline">
          <ChevronLeft size={16} aria-hidden="true" />
          Settings
        </Link>
        <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-tight text-slate-900">{title}</h1>
        {hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}
      </div>
      {children}
    </div>
  );
}
```

Create `src/ui/screens/settings/SettingsRow.tsx`:

```tsx
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import { TINT_CLASS, type Tint } from '../../tints';

interface Props {
  to: string;
  emoji: string;
  tint: Tint;
  title: string;
  summary?: string;
  value?: string;
}

/** One row on the Settings home: tap anywhere to open that page. */
export function SettingsRow({ to, emoji, tint, title, summary, value }: Props) {
  return (
    <li>
      <Link to={to} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
        <span aria-hidden="true" className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base leading-none ${TINT_CLASS[tint]}`}>
          {emoji}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-slate-900">{title}</span>
          {summary && <span className="block truncate text-sm text-slate-500">{summary}</span>}
        </span>
        {value && <span className="shrink-0 text-sm text-slate-500">{value}</span>}
        <ChevronRight size={18} className="shrink-0 text-slate-400" aria-hidden="true" />
      </Link>
    </li>
  );
}
```

Create `src/ui/screens/settings/ChoiceList.tsx`:

```tsx
import { Check } from 'lucide-react';
import { CARD_LIST, GROUP_LABEL } from './SettingsPage';

export interface Choice<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

interface Props<T extends string> {
  name: string;
  legend: string;
  /** Show the legend as a small heading above the card; otherwise it is for screen readers only. */
  showLegend?: boolean;
  choices: readonly Choice<T>[];
  value: T;
  onChange: (value: T) => void;
}

/** Radio choices drawn as rows in a card; the chosen row has a tick. */
export function ChoiceList<T extends string>({ name, legend, showLegend = false, choices, value, onChange }: Props<T>) {
  return (
    <fieldset>
      <legend className={showLegend ? GROUP_LABEL : 'sr-only'}>{legend}</legend>
      <div className={CARD_LIST}>
        {choices.map((choice) => (
          <label key={choice.value} className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-slate-50 has-[:focus-visible]:bg-slate-100">
            <input
              type="radio"
              name={name}
              value={choice.value}
              checked={value === choice.value}
              onChange={() => onChange(choice.value)}
              className="sr-only"
            />
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-slate-900">{choice.label}</span>
              {choice.hint && <span className="block text-sm text-slate-500">{choice.hint}</span>}
            </span>
            {value === choice.value && <Check size={18} className="shrink-0 text-emerald-700" aria-hidden="true" />}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
```

In `src/ui/hooks.ts`, add `import { useEffect, useState } from 'react';` at the top and append:

```ts
/** How much this site stores, like "2.1 MB"; null until the browser answers, or when it cannot. */
export function useStorageUsage(): string | null {
  const [usage, setUsage] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    navigator.storage?.estimate?.()
      .then((e) => {
        if (live && e.usage !== undefined) setUsage(`${(e.usage / 1024 / 1024).toFixed(1)} MB`);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return usage;
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run src/ui/screens/settings/parts.test.tsx && npm run typecheck`
Expected: PASS (6 tests), no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens/settings src/ui/hooks.ts
git commit -m "feat(settings): page frame, rows, choice list and storage hook

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Appearance, Units and Default servings pages

**Files:**
- Create: `src/ui/screens/settings/AppearancePage.tsx`
- Create: `src/ui/screens/settings/UnitsPage.tsx`
- Create: `src/ui/screens/settings/ServingsPage.tsx`
- Modify: `src/ui/App.tsx`
- Test: `src/ui/screens/settings/PreferencePages.test.tsx`

**Interfaces:**
- Consumes: `SettingsPage`, `CARD`, `ChoiceList` (Task 4).
- Produces: `AppearancePage`, `UnitsPage`, `ServingsPage` (no props). Also `THEME_LABEL: Record<ThemePref, string>` (`system: 'Match device'`, `light: 'Light'`, `dark: 'Dark'`) from `AppearancePage.tsx`, and `UNIT_LABEL: Record<UnitSystem, string>` (`us: 'US'`, `metric: 'Metric'`) from `UnitsPage.tsx`, both used by the home in Task 10. Routes `settings/appearance`, `settings/units`, `settings/servings`.

- [ ] **Step 1: Write the failing tests**

Create `src/ui/screens/settings/PreferencePages.test.tsx`:

```tsx
// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { getSettings } from '../../../data/db';
import { renderRoutes } from '../../../test/render';
import { AppearancePage } from './AppearancePage';
import { ServingsPage } from './ServingsPage';
import { UnitsPage } from './UnitsPage';

const routes = [
  { path: '/settings/appearance', element: <AppearancePage /> },
  { path: '/settings/units', element: <UnitsPage /> },
  { path: '/settings/servings', element: <ServingsPage /> },
];

describe('Appearance page', () => {
  it('switches the theme and remembers it on this device', async () => {
    const { user } = renderRoutes(routes, '/settings/appearance');
    expect(screen.getByRole('heading', { level: 1, name: 'Appearance' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Match my device' })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('cartcraft-theme')).toBe('dark');
    await user.click(screen.getByRole('radio', { name: 'Match my device' }));
    expect(localStorage.getItem('cartcraft-theme')).toBeNull();
    delete document.documentElement.dataset.theme;
  });
});

describe('Units page', () => {
  it('saves the unit system', async () => {
    const { user, db } = renderRoutes(routes, '/settings/units');
    await user.click(await screen.findByRole('radio', { name: /^Metric/ }));
    await waitFor(async () => expect((await getSettings(db)).unitSystem).toBe('metric'));
    expect(screen.getByRole('radio', { name: /^Metric/ })).toBeChecked();
  });

  it('reports a failed save next to the choices', async () => {
    const { user, db } = renderRoutes(routes, '/settings/units');
    vi.spyOn(db.settings, 'put').mockRejectedValueOnce(new Error('disk'));
    await user.click(await screen.findByRole('radio', { name: /^Metric/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save that setting. Try again.');
  });
});

describe('Default servings page', () => {
  it('steps up and down and saves a typed number', async () => {
    const { user, db } = renderRoutes(routes, '/settings/servings');
    const input = await screen.findByLabelText('Default servings');
    await waitFor(() => expect(input).toHaveValue(4));
    await user.click(screen.getByRole('button', { name: 'More servings' }));
    await waitFor(async () => expect((await getSettings(db)).defaultServings).toBe(5));
    // The field follows the saved value, so the next step starts from 5, not a stale 4.
    await waitFor(() => expect(input).toHaveValue(5));
    await user.click(screen.getByRole('button', { name: 'Fewer servings' }));
    await waitFor(async () => expect((await getSettings(db)).defaultServings).toBe(4));
    await waitFor(() => expect(input).toHaveValue(4));
    await user.clear(input);
    await user.type(input, '6');
    await waitFor(async () => expect((await getSettings(db)).defaultServings).toBe(6));
  });

  it('ignores a cleared field and restores the saved number on blur', async () => {
    const { user, db } = renderRoutes(routes, '/settings/servings');
    const input = await screen.findByLabelText('Default servings');
    await waitFor(() => expect(input).toHaveValue(4));
    await user.clear(input);
    await user.tab();
    expect(input).toHaveValue(4);
    expect((await getSettings(db)).defaultServings).toBe(4);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/ui/screens/settings/PreferencePages.test.tsx`
Expected: FAIL, cannot resolve `./AppearancePage`.

- [ ] **Step 3: Implement the pages**

Create `src/ui/screens/settings/AppearancePage.tsx`:

```tsx
import { useState } from 'react';
import { getThemePref, setThemePref, type ThemePref } from '../../theme';
import { ChoiceList, type Choice } from './ChoiceList';
import { SettingsPage } from './SettingsPage';

const THEME_CHOICES: Choice<ThemePref>[] = [
  { value: 'system', label: 'Match my device' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/** Short names for the Settings home. */
export const THEME_LABEL: Record<ThemePref, string> = { system: 'Match device', light: 'Light', dark: 'Dark' };

export function AppearancePage() {
  const [pref, setPref] = useState(getThemePref);
  return (
    <SettingsPage title="Appearance" hint="Colours for this device.">
      <ChoiceList
        name="theme"
        legend="Theme"
        choices={THEME_CHOICES}
        value={pref}
        onChange={(value) => {
          setPref(value);
          setThemePref(value);
        }}
      />
    </SettingsPage>
  );
}
```

Create `src/ui/screens/settings/UnitsPage.tsx`:

```tsx
import { updateSettings } from '../../../data/db';
import type { UnitSystem } from '../../../domain';
import { ErrorNote } from '../../components/ErrorNote';
import { useDb } from '../../db';
import { useSettings } from '../../hooks';
import { useAsyncAction } from '../../useAsyncAction';
import { ChoiceList, type Choice } from './ChoiceList';
import { SettingsPage } from './SettingsPage';

const UNIT_CHOICES: Choice<UnitSystem>[] = [
  { value: 'us', label: 'US', hint: 'cups, oz, lb' },
  { value: 'metric', label: 'Metric', hint: 'ml, g, kg' },
];

/** Short names for the Settings home. */
export const UNIT_LABEL: Record<UnitSystem, string> = { us: 'US', metric: 'Metric' };

export function UnitsPage() {
  const db = useDb();
  const settings = useSettings();
  const save = useAsyncAction((fn: () => Promise<void>) => fn(), 'Could not save that setting. Try again.');
  return (
    <SettingsPage title="Units" hint="Amounts on recipes and lists use this system.">
      <ChoiceList
        name="units"
        legend="Unit system"
        choices={UNIT_CHOICES}
        value={settings.unitSystem}
        onChange={(unitSystem) => void save.run(() => updateSettings(db, { unitSystem }))}
      />
      <ErrorNote message={save.error} />
    </SettingsPage>
  );
}
```

Create `src/ui/screens/settings/ServingsPage.tsx`:

```tsx
import { Minus, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { updateSettings } from '../../../data/db';
import { ErrorNote } from '../../components/ErrorNote';
import { useDb } from '../../db';
import { useSettings } from '../../hooks';
import { useAsyncAction } from '../../useAsyncAction';
import { CARD, SettingsPage } from './SettingsPage';

const MAX = 99;
const STEP = 'inline-flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-40';

export function ServingsPage() {
  const db = useDb();
  const settings = useSettings();
  const value = settings.defaultServings;
  // A local draft lets the field be cleared while typing; only positive whole numbers are saved.
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const save = useAsyncAction((fn: () => Promise<void>) => fn(), 'Could not save that setting. Try again.');
  const set = (n: number) => void save.run(() => updateSettings(db, { defaultServings: n }));

  return (
    <SettingsPage title="Default servings" hint="Recipes start at this many servings when you pick them for a list, and new recipes use it when they don't say.">
      <div className={`${CARD} flex items-center justify-center gap-5 p-5`}>
        <button type="button" aria-label="Fewer servings" disabled={value <= 1} onClick={() => set(value - 1)} className={STEP}>
          <Minus size={18} aria-hidden="true" />
        </button>
        <input
          type="number"
          min={1}
          max={MAX}
          aria-label="Default servings"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            const n = Number(e.target.value);
            if (e.target.value !== '' && Number.isInteger(n) && n > 0) set(n);
          }}
          onBlur={() => setDraft(String(value))}
          className="w-20 bg-transparent text-center text-3xl font-bold tabular-nums text-slate-900 outline-none [appearance:textfield] focus:rounded-lg focus:ring-2 focus:ring-emerald-600 [&::-webkit-inner-spin-button]:appearance-none"
        />
        <button type="button" aria-label="More servings" disabled={value >= MAX} onClick={() => set(value + 1)} className={STEP}>
          <Plus size={18} aria-hidden="true" />
        </button>
      </div>
      <ErrorNote message={save.error} />
    </SettingsPage>
  );
}
```

In `src/ui/App.tsx`, add imports:

```tsx
import { AppearancePage } from './screens/settings/AppearancePage';
import { ServingsPage } from './screens/settings/ServingsPage';
import { UnitsPage } from './screens/settings/UnitsPage';
```

and after `<Route path="settings" element={<SettingsScreen />} />` add:

```tsx
        <Route path="settings/appearance" element={<AppearancePage />} />
        <Route path="settings/units" element={<UnitsPage />} />
        <Route path="settings/servings" element={<ServingsPage />} />
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run src/ui/screens/settings/PreferencePages.test.tsx && npm run typecheck`
Expected: PASS (5 tests), no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens/settings src/ui/App.tsx
git commit -m "feat(settings): appearance, units and default servings pages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Aisles page with drag and keyboard reorder

**Files:**
- Create: `src/ui/screens/settings/aisleDrag.ts`
- Test: `src/ui/screens/settings/aisleDrag.test.ts`
- Create: `src/ui/screens/settings/AislesPage.tsx`
- Test: `src/ui/screens/settings/AislesPage.test.tsx`
- Modify: `src/ui/App.tsx`

**Interfaces:**
- Consumes: `moveAisleTo` (Task 1), `renameAisle` (existing), `AisleBadge` (Task 2), `SettingsPage`, `CARD_LIST` (Task 4), `useAisles` (existing).
- Produces from `aisleDrag.ts`: `dropIndex(from: number, offset: number, rowHeight: number, count: number): number` and `rowShift(index: number, from: number, to: number, rowHeight: number): number`. Produces `AislesPage` (no props) and route `settings/aisles`.

- [ ] **Step 1: Write the failing math tests**

Create `src/ui/screens/settings/aisleDrag.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { dropIndex, rowShift } from './aisleDrag';

describe('dropIndex', () => {
  it('moves one place per row height, rounding to the nearest row', () => {
    expect(dropIndex(0, 0, 48, 11)).toBe(0);
    expect(dropIndex(0, 30, 48, 11)).toBe(1);
    expect(dropIndex(0, 100, 48, 11)).toBe(2);
    expect(dropIndex(5, -50, 48, 11)).toBe(4);
  });

  it('stays inside the list', () => {
    expect(dropIndex(1, -500, 48, 11)).toBe(0);
    expect(dropIndex(9, 500, 48, 11)).toBe(10);
  });
});

describe('rowShift', () => {
  it('moves rows between the old and new place to make room', () => {
    // Dragging row 1 down to 3: rows 2 and 3 move up.
    expect(rowShift(2, 1, 3, 48)).toBe(-48);
    expect(rowShift(3, 1, 3, 48)).toBe(-48);
    expect(rowShift(4, 1, 3, 48)).toBe(0);
    expect(rowShift(0, 1, 3, 48)).toBe(0);
    // Dragging row 4 up to 2: rows 2 and 3 move down.
    expect(rowShift(2, 4, 2, 48)).toBe(48);
    expect(rowShift(3, 4, 2, 48)).toBe(48);
    expect(rowShift(1, 4, 2, 48)).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/ui/screens/settings/aisleDrag.test.ts`
Expected: FAIL, cannot resolve `./aisleDrag`.

- [ ] **Step 3: Implement the math**

Create `src/ui/screens/settings/aisleDrag.ts`:

```ts
/** The place a dragged row lands after moving `offset` pixels, one place per row height. */
export function dropIndex(from: number, offset: number, rowHeight: number, count: number): number {
  return Math.min(Math.max(0, from + Math.round(offset / rowHeight)), count - 1);
}

/** How far a row that is not being dragged moves to make room for the dragged one. */
export function rowShift(index: number, from: number, to: number, rowHeight: number): number {
  if (from < to && index > from && index <= to) return -rowHeight;
  if (from > to && index >= to && index < from) return rowHeight;
  return 0;
}
```

- [ ] **Step 4: Run the math tests**

Run: `npx vitest run src/ui/screens/settings/aisleDrag.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing page tests**

jsdom 26 has no `PointerEvent`, and Testing Library falls back to a plain `Event` without `clientY`. The test adds a small `PointerEvent` built on jsdom's `MouseEvent`, so `clientY` and `pointerId` arrive. jsdom also reports `offsetHeight` as 0, so the page falls back to a 48px row height.

Create `src/ui/screens/settings/AislesPage.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';
import type { CartCraftDb } from '../../../data/db';
import { renderRoutes } from '../../../test/render';
import { AislesPage } from './AislesPage';

const routes = [{ path: '/settings/aisles', element: <AislesPage /> }];
const order = async (db: CartCraftDb) => (await db.aisles.orderBy('order').toArray()).map((a) => a.id);

beforeAll(() => {
  const win = document.defaultView!;
  if (!('PointerEvent' in win)) {
    class TestPointerEvent extends win.MouseEvent {
      pointerId: number;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
      }
    }
    Object.defineProperty(win, 'PointerEvent', { value: TestPointerEvent, configurable: true });
  }
});

describe('Aisles page', () => {
  it('lists the aisles with their emoji badges', async () => {
    renderRoutes(routes, '/settings/aisles');
    const produce = await screen.findByLabelText('Name of Produce');
    expect(produce.closest('li')?.querySelector('[data-aisle-badge]')).toHaveTextContent('🥕');
  });

  it('renames an aisle on blur', async () => {
    const { user, db } = renderRoutes(routes, '/settings/aisles');
    const name = await screen.findByLabelText('Name of Produce');
    await user.clear(name);
    await user.type(name, 'Fruit & Veg');
    await user.tab();
    await waitFor(async () => expect((await db.aisles.get('produce'))?.name).toBe('Fruit & Veg'));
  });

  it('restores the aisle name when it is cleared', async () => {
    const { user, db } = renderRoutes(routes, '/settings/aisles');
    const name = await screen.findByLabelText('Name of Produce');
    await user.clear(name);
    await user.tab();
    expect(name).toHaveValue('Produce');
    expect((await db.aisles.get('produce'))?.name).toBe('Produce');
  });

  it('moves an aisle with the arrow keys and announces it', async () => {
    const { user, db } = renderRoutes(routes, '/settings/aisles');
    const shown = () => screen.getAllByRole('button', { name: /^Reorder / }).map((b) => b.getAttribute('aria-label'));
    const handle = await screen.findByRole('button', { name: 'Reorder Meat & Seafood' });
    handle.focus();
    await user.keyboard('{ArrowUp}');
    // Wait for the rows to re-render before the next key, so the next move starts from the new place.
    await waitFor(() => expect(shown()[0]).toBe('Reorder Meat & Seafood'));
    expect((await order(db))[0]).toBe('meat-seafood');
    expect(await screen.findByText('Meat & Seafood moved to position 1 of 11')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reorder Meat & Seafood' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(shown()[1]).toBe('Reorder Meat & Seafood'));
    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(shown()[2]).toBe('Reorder Meat & Seafood'));
    expect((await order(db)).slice(0, 3)).toEqual(['produce', 'dairy-eggs', 'meat-seafood']);
  });

  it('moves an aisle by dragging its handle', async () => {
    const { db } = renderRoutes(routes, '/settings/aisles');
    const handle = await screen.findByRole('button', { name: 'Reorder Produce' });
    fireEvent.pointerDown(handle, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientY: 196, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientY: 196, pointerId: 1 });
    await waitFor(async () => expect((await order(db)).slice(0, 3)).toEqual(['meat-seafood', 'dairy-eggs', 'produce']));
    expect(await screen.findByText('Produce moved to position 3 of 11')).toBeInTheDocument();
  });

  it('leaves the order alone when a drag is cancelled', async () => {
    const { db } = renderRoutes(routes, '/settings/aisles');
    const before = await order(db);
    const handle = await screen.findByRole('button', { name: 'Reorder Produce' });
    fireEvent.pointerDown(handle, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientY: 300, pointerId: 1 });
    fireEvent.pointerCancel(handle, { pointerId: 1 });
    expect(await order(db)).toEqual(before);
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run src/ui/screens/settings/AislesPage.test.tsx`
Expected: FAIL, cannot resolve `./AislesPage`.

- [ ] **Step 7: Implement the page**

Create `src/ui/screens/settings/AislesPage.tsx`:

```tsx
import { GripVertical } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { moveAisleTo, renameAisle } from '../../../app/settings';
import { AisleBadge } from '../../components/AisleBadge';
import { ErrorNote } from '../../components/ErrorNote';
import { useDb } from '../../db';
import { useAisles } from '../../hooks';
import { useAsyncAction } from '../../useAsyncAction';
import { dropIndex, rowShift } from './aisleDrag';
import { CARD_LIST, SettingsPage } from './SettingsPage';

/** Used when the browser reports no height (tests); real rows are measured. */
const FALLBACK_ROW_HEIGHT = 48;

interface Drag {
  id: string;
  from: number;
  startY: number;
  offset: number;
  rowHeight: number;
}

export function AislesPage() {
  const db = useDb();
  const aisles = useAisles();
  const action = useAsyncAction((fn: () => Promise<void>) => fn(), 'Could not update aisles. Try again.');
  const [drag, setDrag] = useState<Drag | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const handles = useRef(new Map<string, HTMLButtonElement>());
  const refocus = useRef<string | null>(null);
  const hintId = useId();

  // Keeps keyboard focus on the handle after its row moves.
  useEffect(() => {
    if (refocus.current) handles.current.get(refocus.current)?.focus();
    refocus.current = null;
  }, [aisles]);

  if (!aisles) return null;
  const count = aisles.length;

  const move = (id: string, name: string, to: number) => {
    const target = Math.min(Math.max(0, to), count - 1);
    void action.run(async () => {
      await moveAisleTo(db, id, target);
      setAnnouncement(`${name} moved to position ${target + 1} of ${count}`);
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, id: string, name: string, index: number) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const to = index + (e.key === 'ArrowUp' ? -1 : 1);
    if (to < 0 || to >= count) return;
    refocus.current = id;
    move(id, name, to);
  };

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>, id: string, index: number) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const rowHeight = e.currentTarget.closest('li')?.offsetHeight || FALLBACK_ROW_HEIGHT;
    setDrag({ id, from: index, startY: e.clientY, offset: 0, rowHeight });
  };

  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    setDrag((d) => (d ? { ...d, offset: e.clientY - d.startY } : d));
  };

  const onPointerUp = (name: string) => {
    if (!drag) return;
    const to = dropIndex(drag.from, drag.offset, drag.rowHeight, count);
    setDrag(null);
    if (to !== drag.from) move(drag.id, name, to);
  };

  const target = drag ? dropIndex(drag.from, drag.offset, drag.rowHeight, count) : -1;

  return (
    <SettingsPage title="Aisles" hint="Lists follow this order. Drag to match your store, tap a name to rename.">
      <p id={hintId} className="sr-only">Use the arrow keys to move an aisle up or down.</p>
      <ol className={CARD_LIST}>
        {aisles.map((aisle, index) => {
          const dragged = drag?.id === aisle.id;
          const shift = drag && !dragged ? rowShift(index, drag.from, target, drag.rowHeight) : 0;
          const y = dragged ? drag.offset : shift;
          return (
            <li
              key={aisle.id}
              style={drag ? { transform: `translateY(${y}px)` } : undefined}
              className={`relative flex items-center gap-3 bg-white px-3 py-2 ${dragged ? 'z-10 shadow-lg ring-1 ring-slate-200' : ''} ${drag && !dragged ? 'transition-transform' : ''}`}
            >
              <AisleBadge aisleId={aisle.id} />
              <input
                className="min-w-0 flex-1 rounded-lg bg-transparent px-2 py-1.5 font-medium text-slate-900 hover:bg-slate-50 focus:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                defaultValue={aisle.name}
                aria-label={`Name of ${aisle.name}`}
                onBlur={(e) => {
                  const name = e.target.value.trim();
                  if (!name) e.target.value = aisle.name;
                  else if (name !== aisle.name) void action.run(() => renameAisle(db, aisle.id, name));
                }}
              />
              <button
                type="button"
                ref={(el) => {
                  if (el) handles.current.set(aisle.id, el);
                  else handles.current.delete(aisle.id);
                }}
                aria-label={`Reorder ${aisle.name}`}
                aria-describedby={hintId}
                onKeyDown={(e) => onKeyDown(e, aisle.id, aisle.name, index)}
                onPointerDown={(e) => onPointerDown(e, aisle.id, index)}
                onPointerMove={onPointerMove}
                onPointerUp={() => onPointerUp(aisle.name)}
                onPointerCancel={() => setDrag(null)}
                className="cursor-grab touch-none rounded-lg p-2 text-slate-400 hover:bg-slate-100 active:cursor-grabbing"
              >
                <GripVertical size={18} aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ol>
      <p aria-live="polite" className="sr-only">{announcement}</p>
      <ErrorNote message={action.error} />
    </SettingsPage>
  );
}
```

In `src/ui/App.tsx`, add `import { AislesPage } from './screens/settings/AislesPage';` and the route:

```tsx
        <Route path="settings/aisles" element={<AislesPage />} />
```

- [ ] **Step 8: Run tests and typecheck**

Run: `npx vitest run src/ui/screens/settings/aisleDrag.test.ts src/ui/screens/settings/AislesPage.test.tsx && npm run typecheck`
Expected: PASS, no type errors. If `setPointerCapture?.` is reported as an error by the typechecker, change it to `if ('setPointerCapture' in e.currentTarget) e.currentTarget.setPointerCapture(e.pointerId);`.

- [ ] **Step 9: Check drag in a real browser**

Run `npm run dev`, open `http://localhost:5173/settings/aisles` in the browser pane at mobile size, drag "Frozen" up two rows with the handle, and confirm that the other rows slide out of the way, the order saves after you let go, and the page doesn't scroll while you drag. Stop the dev server.

- [ ] **Step 10: Commit**

```bash
git add src/ui/screens/settings src/ui/App.tsx
git commit -m "feat(settings): aisles page with drag and keyboard reorder

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Pantry staples and Storage pages

**Files:**
- Create: `src/ui/screens/settings/PantryPage.tsx`
- Create: `src/ui/screens/settings/StoragePage.tsx`
- Modify: `src/ui/App.tsx`
- Test: `src/ui/screens/settings/PantryStoragePages.test.tsx`

**Interfaces:**
- Consumes: `addPantryStaple`, `removePantryStaple` (existing), `SettingsPage`, `CARD`, `CARD_LIST`, `useStorageUsage` (Task 4).
- Produces: `PantryPage`, `StoragePage` (no props). Routes `settings/pantry`, `settings/storage`.

- [ ] **Step 1: Write the failing tests**

Create `src/ui/screens/settings/PantryStoragePages.test.tsx`:

```tsx
// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { updateSettings } from '../../../data/db';
import { createTestDb } from '../../../test/db';
import { renderRoutes } from '../../../test/render';
import { PantryPage } from './PantryPage';
import { StoragePage } from './StoragePage';

const routes = [
  { path: '/settings/pantry', element: <PantryPage /> },
  { path: '/settings/storage', element: <StoragePage /> },
];

afterEach(() => {
  Reflect.deleteProperty(navigator, 'storage');
});

describe('Pantry staples page', () => {
  it('adds and removes pantry staples', async () => {
    const { user, db } = renderRoutes(routes, '/settings/pantry');
    expect(await screen.findByText('salt')).toBeInTheDocument();
    await user.type(screen.getByLabelText('New pantry staple'), 'Garlic Powder');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('garlic powder')).toBeInTheDocument();
    expect(screen.getByLabelText('New pantry staple')).toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'Remove garlic powder' }));
    await waitFor(async () => expect(await db.pantryStaples.get('garlic powder')).toBeUndefined());
  });
});

describe('Storage page', () => {
  it('shows usage, protection and the version', async () => {
    Object.defineProperty(navigator, 'storage', { value: { estimate: async () => ({ usage: 1024 * 1024 }) }, configurable: true });
    const db = createTestDb();
    await updateSettings(db, { persistGranted: true });
    renderRoutes(routes, '/settings/storage', db);
    expect(await screen.findByText('1.0 MB')).toBeInTheDocument();
    expect(await screen.findByText('This browser will keep your data.')).toBeInTheDocument();
    expect(screen.getByText('test')).toBeInTheDocument();
  });

  it('warns when the browser may clear data', async () => {
    const db = createTestDb();
    await updateSettings(db, { persistGranted: false });
    renderRoutes(routes, '/settings/storage', db);
    expect(await screen.findByText(/may clear your data when space runs low/)).toBeInTheDocument();
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/ui/screens/settings/PantryStoragePages.test.tsx`
Expected: FAIL, cannot resolve `./PantryPage`.

- [ ] **Step 3: Implement**

Create `src/ui/screens/settings/PantryPage.tsx`:

```tsx
import { useLiveQuery } from 'dexie-react-hooks';
import { X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { addPantryStaple, removePantryStaple } from '../../../app/settings';
import { ErrorNote } from '../../components/ErrorNote';
import { useDb } from '../../db';
import { useAsyncAction } from '../../useAsyncAction';
import { CARD, SettingsPage } from './SettingsPage';

export function PantryPage() {
  const db = useDb();
  const pantry = useLiveQuery(() => db.pantryStaples.orderBy('itemKey').toArray(), [db]);
  const [staple, setStaple] = useState('');
  const action = useAsyncAction((fn: () => Promise<void>) => fn(), 'Could not update pantry staples. Try again.');

  const onAdd = (e: FormEvent) => {
    e.preventDefault();
    void action.run(async () => {
      if (await addPantryStaple(db, staple)) setStaple('');
    });
  };

  return (
    <SettingsPage title="Pantry staples" hint={'These go in a "Check pantry" section instead of an aisle.'}>
      {pantry && pantry.length > 0 && (
        <ul className={`${CARD} flex flex-wrap gap-2 p-3`}>
          {pantry.map((p) => (
            <li key={p.itemKey} className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-1 pl-3 pr-1 text-sm text-slate-800">
              {p.itemKey}
              <button
                type="button"
                onClick={() => void action.run(() => removePantryStaple(db, p.itemKey))}
                className="rounded-full p-1 text-slate-500 hover:bg-white"
                aria-label={`Remove ${p.itemKey}`}
              >
                <X size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={onAdd} className={`${CARD} flex items-center gap-2 p-2 pl-4 focus-within:ring-2 focus-within:ring-emerald-600`}>
        <input
          className="min-w-0 flex-1 bg-transparent py-1.5 outline-none"
          value={staple}
          onChange={(e) => setStaple(e.target.value)}
          aria-label="New pantry staple"
          placeholder="Add a staple, e.g. garlic powder"
        />
        <button type="submit" disabled={!staple.trim()} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
          Add
        </button>
      </form>
      <ErrorNote message={action.error} />
    </SettingsPage>
  );
}
```

Create `src/ui/screens/settings/StoragePage.tsx`:

```tsx
import { useSettings, useStorageUsage } from '../../hooks';
import { CARD_LIST, SettingsPage } from './SettingsPage';

const ROW = 'flex items-start justify-between gap-4 px-4 py-3';

export function StoragePage() {
  const settings = useSettings();
  const usage = useStorageUsage();
  const protection =
    settings.persistGranted === true ? 'This browser will keep your data.'
      : settings.persistGranted === false ? 'This browser may clear your data when space runs low. Export backups regularly.'
        : 'Storage protection is requested after you save your first recipe.';

  return (
    <SettingsPage title="Storage" hint="Everything is kept in this browser on this device.">
      <dl className={CARD_LIST}>
        <div className={ROW}>
          <dt className="font-medium text-slate-900">Used</dt>
          <dd className="text-sm text-slate-500">{usage ?? 'Unknown'}</dd>
        </div>
        <div className={ROW}>
          <dt className="shrink-0 font-medium text-slate-900">Protection</dt>
          <dd className="text-right text-sm text-slate-500">{protection}</dd>
        </div>
        <div className={ROW}>
          <dt className="font-medium text-slate-900">Version</dt>
          <dd className="text-sm text-slate-500">{__APP_VERSION__}</dd>
        </div>
      </dl>
    </SettingsPage>
  );
}
```

In `src/ui/App.tsx`, add the imports for `PantryPage` and `StoragePage` from `./screens/settings/...` and the routes:

```tsx
        <Route path="settings/pantry" element={<PantryPage />} />
        <Route path="settings/storage" element={<StoragePage />} />
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run src/ui/screens/settings/PantryStoragePages.test.tsx && npm run typecheck`
Expected: PASS (3 tests), no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens/settings src/ui/App.tsx
git commit -m "feat(settings): pantry staples and storage pages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: AI helper page

**Files:**
- Modify: `src/ui/components/AiSettings.tsx` (rewrite the JSX; logic unchanged)
- Create: `src/ui/screens/settings/AiPage.tsx`
- Test: `src/ui/screens/settings/AiPage.test.tsx` (replaces `src/ui/screens/SettingsAi.test.tsx`)
- Delete: `src/ui/screens/SettingsAi.test.tsx`
- Modify: `src/ui/App.tsx`

**Interfaces:**
- Consumes: `ChoiceList` (with `showLegend`), `CARD`, `GROUP_LABEL`, `SettingsPage` (Task 4); `TINT_CLASS`.
- Produces: `AiPage` (no props), route `settings/ai`. `AiSettings` no longer renders its intro paragraph (the page hint has it). The provider is chosen with radios named after each provider (`DeepSeek`, `OpenRouter`, `OpenAI`, `Groq`) in a group labelled `Provider`. The names "Model", "API key", "Save key", "Remove key", "Test connection" and the texts "Key saved for X.", "Connection works." stay the same.

- [ ] **Step 1: Write the failing tests**

Create `src/ui/screens/settings/AiPage.test.tsx`:

```tsx
// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveAiKey } from '../../../app/ai';
import { exportBackup, serializeBackup } from '../../../data/backup';
import { getSettings } from '../../../data/db';
import { createTestDb } from '../../../test/db';
import { renderRoutes } from '../../../test/render';
import { AiPage } from './AiPage';

const routes = [{ path: '/settings/ai', element: <AiPage /> }];

function stubProvider(content: unknown, status = 200) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AI helper page', () => {
  it('saves provider and model, and saves the key without exporting it', async () => {
    const { user, db } = renderRoutes(routes, '/settings/ai');
    expect(screen.getByRole('heading', { level: 1, name: 'AI helper' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Provider' })).toBeInTheDocument();
    await user.click(await screen.findByRole('radio', { name: 'OpenRouter' }));
    await waitFor(async () => expect((await getSettings(db)).llm.providerId).toBe('openrouter'));
    expect(screen.getByRole('radio', { name: 'OpenRouter' })).toBeChecked();

    const model = screen.getByLabelText('Model');
    await waitFor(() => expect(model).toHaveAttribute('placeholder', 'deepseek/deepseek-v4.1-flash'));
    await user.type(model, 'qwen/qwen3.7-flash');
    await user.tab();
    await waitFor(async () => expect((await getSettings(db)).llm.model).toBe('qwen/qwen3.7-flash'));

    await user.type(screen.getByLabelText('API key'), 'sk-secret-123');
    await user.click(screen.getByRole('button', { name: 'Save key' }));
    expect(await screen.findByText('Key saved for OpenRouter.')).toBeInTheDocument();
    expect((await db.secrets.get('secrets'))?.llmApiKey).toBe('sk-secret-123');
    expect(serializeBackup(await exportBackup(db, 1))).not.toContain('sk-secret-123');
  });

  it('removes a saved key', async () => {
    const db = createTestDb();
    await saveAiKey(db, 'sk-old');
    const { user } = renderRoutes(routes, '/settings/ai', db);
    await user.click(await screen.findByRole('button', { name: 'Remove key' }));
    expect(await screen.findByLabelText('API key')).toBeInTheDocument();
    expect(await db.secrets.get('secrets')).toBeUndefined();
  });

  it('tests the connection with the typed key before saving it', async () => {
    const fetchMock = stubProvider({ ok: true });
    const { user, db } = renderRoutes(routes, '/settings/ai');
    await user.type(await screen.findByLabelText('API key'), 'sk-try');
    await user.click(screen.getByRole('button', { name: 'Test connection' }));
    expect(await screen.findByText('Connection works.')).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.deepseek.com/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-try');
    expect(await db.secrets.get('secrets')).toBeUndefined();
  });

  it('shows which provider the key is for and refuses it for another provider', async () => {
    const fetchMock = stubProvider({ ok: true });
    const db = createTestDb();
    await saveAiKey(db, 'sk-ds');
    const { user } = renderRoutes(routes, '/settings/ai', db);
    expect(await screen.findByText('Key saved for DeepSeek.')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'OpenAI' }));
    expect(await screen.findByText(/will not be used with OpenAI/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Test connection' })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('clears the connection message when the provider changes', async () => {
    stubProvider({ ok: true });
    const { user } = renderRoutes(routes, '/settings/ai');
    await user.type(await screen.findByLabelText('API key'), 'sk-try');
    await user.click(screen.getByRole('button', { name: 'Test connection' }));
    expect(await screen.findByText('Connection works.')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Groq' }));
    await waitFor(() => expect(screen.queryByText('Connection works.')).not.toBeInTheDocument());
  });

  it('explains a rejected key', async () => {
    stubProvider({}, 401);
    const db = createTestDb();
    await saveAiKey(db, 'sk-bad');
    const { user } = renderRoutes(routes, '/settings/ai', db);
    await user.click(await screen.findByRole('button', { name: 'Test connection' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The AI provider rejected the key. Check it in Settings.');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/ui/screens/settings/AiPage.test.tsx`
Expected: FAIL, cannot resolve `./AiPage`.

- [ ] **Step 3: Implement**

Create `src/ui/screens/settings/AiPage.tsx`:

```tsx
import { AiSettings } from '../../components/AiSettings';
import { SettingsPage } from './SettingsPage';

export function AiPage() {
  return (
    <SettingsPage
      title="AI helper"
      hint="Optional. AI can tidy up pasted recipes, sort unknown items into aisles and suggest swaps. Your key stays on this device, is sent only to the provider you choose, and is never included in backups."
    >
      <AiSettings />
    </SettingsPage>
  );
}
```

In `src/ui/components/AiSettings.tsx`, add these imports:

```tsx
import { TINT_CLASS } from '../tints';
import { ChoiceList } from '../screens/settings/ChoiceList';
import { CARD, GROUP_LABEL } from '../screens/settings/SettingsPage';
```

Keep everything above `return (` unchanged. Replace the returned JSX with:

```tsx
  return (
    <div className="space-y-5">
      <ChoiceList
        name="provider"
        legend="Provider"
        showLegend
        choices={PROVIDERS.map((p) => ({ value: p.id, label: p.name }))}
        value={provider.id}
        onChange={(providerId) => void save.run(() => updateSettings(db, { llm: { providerId, model: '' } }))}
      />

      <label className="block">
        <span className={`block ${GROUP_LABEL}`}>Model</span>
        <input
          className={`${CARD} block w-full px-4 py-3 font-mono text-sm outline-none focus:ring-2 focus:ring-emerald-600`}
          value={model}
          placeholder={provider.defaultModel}
          onChange={(e) => setModel(e.target.value)}
          onBlur={() => model.trim() !== settings.llm.model && void save.run(() => updateSettings(db, { llm: { providerId: provider.id, model: model.trim() } }))}
        />
      </label>

      <div>
        <p className={GROUP_LABEL}>Key</p>
        {hasKey ? (
          <div className={`${CARD} flex items-center gap-3 px-4 py-3`}>
            <span aria-hidden="true" className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base ${TINT_CLASS[keyMismatch ? 'amber' : 'green']}`}>
              {keyMismatch ? '⚠️' : '✓'}
            </span>
            <span className="min-w-0 flex-1 text-sm font-medium text-slate-900">Key saved for {getProvider(keyStatus?.savedFor ?? '').name}.</span>
            <button type="button" onClick={() => void save.run(() => clearAiKey(db))} className="text-sm font-semibold text-red-700">Remove key</button>
          </div>
        ) : (
          <form
            className={`${CARD} flex items-center gap-2 p-2 pl-4 focus-within:ring-2 focus-within:ring-emerald-600`}
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
              className="min-w-0 flex-1 bg-transparent py-1.5 font-mono text-sm outline-none"
              placeholder={`${provider.name} API key`}
              aria-label="API key"
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
            />
            <button type="submit" disabled={!keyDraft.trim()} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">Save key</button>
          </form>
        )}
      </div>

      {keyMismatch && (
        <p className="text-sm text-amber-800">
          This key will not be used with {provider.name}. Remove it to add a {provider.name} key, or switch back to {getProvider(keyStatus?.savedFor ?? '').name}.
        </p>
      )}
      <button
        type="button"
        onClick={() => void test.run()}
        disabled={test.pending || (!keyStatus?.usableKey && !keyDraft.trim())}
        className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-slate-900 ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-40"
      >
        {test.pending ? 'Testing...' : 'Test connection'}
      </button>
      <ErrorNote message={save.error ?? test.error} />
      {message && <p role="status" className="text-sm text-emerald-800">{message}</p>}
    </div>
  );
```

Delete `src/ui/screens/SettingsAi.test.tsx` (every case now lives in `AiPage.test.tsx`).

In `src/ui/App.tsx`, add `import { AiPage } from './screens/settings/AiPage';` and the route:

```tsx
        <Route path="settings/ai" element={<AiPage />} />
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run src/ui/screens/settings/AiPage.test.tsx src/ui/screens/SettingsScreen.test.tsx src/ui/screens/SettingsErrors.test.tsx && npm run typecheck`
Expected: PASS. The old Settings tests still pass, because the old screen still renders `AiSettings` and none of its remaining tests touch AI.

- [ ] **Step 5: Commit**

```bash
git add -A src/ui/components/AiSettings.tsx src/ui/screens/settings src/ui/screens/SettingsAi.test.tsx src/ui/App.tsx
git commit -m "feat(settings): AI helper page with a provider list

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Backup and restore page

**Files:**
- Create: `src/ui/screens/settings/BackupPage.tsx`
- Test: `src/ui/screens/settings/BackupPage.test.tsx`
- Modify: `src/ui/App.tsx`

**Interfaces:**
- Consumes: backup functions from `src/data/backup.ts` (unchanged), `SettingsPage`, `CARD_LIST` (Task 4), `TINT_CLASS`.
- Produces: `BackupPage({ now?: () => number })`, route `settings/backup`. Action names: buttons "Export backup" (hint "Save a file"), "Share backup" (hint "Send to another app", only when sharing files works), "Paste a backup" (`aria-expanded`), "Undo last import" (only when available); a file input labelled "Import from file". The paste textarea stays labelled "Paste backup" and its button "Check"; the confirmation keeps "Replace my data" and "Cancel"; all messages keep their wording.

- [ ] **Step 1: Write the failing tests**

Create `src/ui/screens/settings/BackupPage.test.tsx`:

```tsx
// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { draftLinesFromText, saveRecipe } from '../../../app/recipes';
import { exportBackup, MAX_BACKUP_BYTES, serializeBackup } from '../../../data/backup';
import { createTestDb, sequentialIds } from '../../../test/db';
import { renderRoutes } from '../../../test/render';
import { BackupPage } from './BackupPage';

const routes = [{ path: '/settings/backup', element: <BackupPage now={() => Date.UTC(2026, 9, 1)} /> }];

async function backupText(): Promise<string> {
  const source = createTestDb();
  const ids = sequentialIds('r');
  await saveRecipe(source, { title: 'Soup', rawText: '1 onion', baseServings: 2, ingredients: draftLinesFromText('1 onion', ids) }, 1, ids);
  return serializeBackup(await exportBackup(source, 1));
}

describe('Backup and restore page', () => {
  it('exports a backup file', async () => {
    const createObjectURL = vi.fn(() => 'blob:backup');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const { user } = renderRoutes(routes, '/settings/backup');
    await user.click(await screen.findByRole('button', { name: /^Export backup/ }));
    expect(await screen.findByText('Backup downloaded.')).toBeInTheDocument();
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
    click.mockRestore();
  });

  it('hides Share when the browser cannot share files', async () => {
    renderRoutes(routes, '/settings/backup');
    await screen.findByRole('button', { name: /^Export backup/ });
    expect(screen.queryByRole('button', { name: /^Share backup/ })).not.toBeInTheDocument();
  });

  it('shares the backup as a text file when supported', async () => {
    const share = vi.fn(async () => undefined);
    Object.assign(navigator, { share, canShare: () => true });
    const { user } = renderRoutes(routes, '/settings/backup');
    await user.click(await screen.findByRole('button', { name: /^Share backup/ }));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const [{ files }] = share.mock.calls[0] as unknown as [{ files: File[] }];
    expect(files[0]?.name).toBe('cartcraft-backup-2026-10-01.txt');
    expect(files[0]?.type).toBe('text/plain');
    Reflect.deleteProperty(navigator, 'share');
    Reflect.deleteProperty(navigator, 'canShare');
  });

  it('imports a pasted backup after confirmation and can undo', async () => {
    const text = await backupText();
    const { user, db } = renderRoutes(routes, '/settings/backup');
    const paste = await screen.findByRole('button', { name: 'Paste a backup' });
    expect(paste).toHaveAttribute('aria-expanded', 'false');
    await user.click(paste);
    expect(paste).toHaveAttribute('aria-expanded', 'true');
    await user.click(screen.getByLabelText('Paste backup'));
    await user.paste(text);
    await user.click(screen.getByRole('button', { name: 'Check' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('This backup has 1 recipes, 0 lists');
    await user.click(within(alert).getByRole('button', { name: 'Replace my data' }));
    await waitFor(async () => expect(await db.recipes.count()).toBe(1));

    await user.click(await screen.findByRole('button', { name: 'Undo last import' }));
    await waitFor(async () => expect(await db.recipes.count()).toBe(0));
    expect(await screen.findByText('Previous data restored.')).toBeInTheDocument();
  });

  it('explains a rejected backup', async () => {
    const { user } = renderRoutes(routes, '/settings/backup');
    await user.click(await screen.findByRole('button', { name: 'Paste a backup' }));
    await user.type(screen.getByLabelText('Paste backup'), 'hello');
    await user.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByText('That is not a valid backup file (not JSON).')).toBeInTheDocument();
  });

  it('reports a failed import and leaves data unchanged', async () => {
    const text = await backupText();
    const { user, db } = renderRoutes(routes, '/settings/backup');
    await user.click(await screen.findByRole('button', { name: 'Paste a backup' }));
    await user.click(screen.getByLabelText('Paste backup'));
    await user.paste(text);
    await user.click(screen.getByRole('button', { name: 'Check' }));
    vi.spyOn(db.snapshots, 'put').mockRejectedValueOnce(new Error('quota'));
    await user.click(await screen.findByRole('button', { name: 'Replace my data' }));
    expect(await screen.findByText('Import failed. Your data was not changed.')).toBeInTheDocument();
    expect(await db.recipes.count()).toBe(0);
  });

  it('rejects an oversized file by its size without reading it', async () => {
    const { user } = renderRoutes(routes, '/settings/backup');
    const input = await screen.findByLabelText('Import from file');
    const big = new File(['x'], 'big.json', { type: 'application/json' });
    Object.defineProperty(big, 'size', { value: MAX_BACKUP_BYTES + 1 });
    const text = vi.fn(async () => 'x');
    Object.defineProperty(big, 'text', { value: text });
    await user.upload(input, big);
    expect(await screen.findByText('That file is too large to be a CartCraft backup.')).toBeInTheDocument();
    expect(text).not.toHaveBeenCalled();
  });

  it('accepts the same file twice in a row', async () => {
    const text = await backupText();
    const { user } = renderRoutes(routes, '/settings/backup');
    const input = (await screen.findByLabelText('Import from file')) as HTMLInputElement;
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

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/ui/screens/settings/BackupPage.test.tsx`
Expected: FAIL, cannot resolve `./BackupPage`.

- [ ] **Step 3: Implement**

Create `src/ui/screens/settings/BackupPage.tsx`. The logic is moved unchanged from the current `SettingsScreen.tsx` (`IMPORT_ERRORS`, `shareableFile`, `canShareFiles`, `download` and the five actions); only the layout is new:

```tsx
import { useLiveQuery } from 'dexie-react-hooks';
import { useState, type ReactNode } from 'react';
import {
  MAX_BACKUP_BYTES, backupFileName, exportBackup, importBackup, parseBackup, serializeBackup, summarizeBackup, undoLastImport,
  type BackupFile, type ParseResult,
} from '../../../data/backup';
import { ErrorNote } from '../../components/ErrorNote';
import { useDb } from '../../db';
import { TINT_CLASS, type Tint } from '../../tints';
import { useAsyncAction } from '../../useAsyncAction';
import { CARD_LIST, SettingsPage } from './SettingsPage';

const IMPORT_ERRORS: Record<Exclude<ParseResult, { ok: true }>['error'], string> = {
  too_large: 'That file is too large to be a CartCraft backup.',
  not_json: 'That is not a valid backup file (not JSON).',
  wrong_format: 'That file is not a CartCraft backup.',
  newer_version: 'That backup comes from a newer version of CartCraft. Update this app first.',
  invalid: 'That backup is damaged or incomplete.',
};

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

const ROW = 'flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 has-[:focus-visible]:bg-slate-100';

function RowContent({ emoji, tint, title, hint }: { emoji: string; tint: Tint; title: string; hint?: string }) {
  return (
    <>
      <span aria-hidden="true" className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base leading-none ${TINT_CLASS[tint]}`}>
        {emoji}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-slate-900">{title}</span>
        {hint && <span className="block text-sm text-slate-500">{hint}</span>}
      </span>
    </>
  );
}

function ActionRow({ onClick, expanded, children }: { onClick: () => void; expanded?: boolean; children: ReactNode }) {
  return (
    <li>
      <button type="button" onClick={onClick} aria-expanded={expanded} className={ROW}>{children}</button>
    </li>
  );
}

export function BackupPage({ now = Date.now }: { now?: () => number }) {
  const db = useDb();
  const canUndo = useLiveQuery(async () => (await db.snapshots.get('last-import')) !== undefined, [db]);
  const [pasted, setPasted] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const [pending, setPending] = useState<BackupFile | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [shareable] = useState(canShareFiles);

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
      if (!(err instanceof DOMException && err.name === 'AbortError')) setMessage('Sharing failed. Use Export instead.');
    }
  }, 'Could not create the backup. Try again.');

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
    setShowPaste(false);
    setMessage('Import complete. Your previous data can be restored with Undo last import.');
  }, 'Import failed. Your data was not changed.');

  const undoAction = useAsyncAction(async () => {
    if (await undoLastImport(db)) setMessage('Previous data restored.');
  }, 'Could not restore the previous data. Try again.');

  const summary = pending ? summarizeBackup(pending.data) : null;

  return (
    <SettingsPage
      title="Backup and restore"
      hint="Your data lives only on this device. Export a backup to move it or keep it safe. Your AI key is never included."
    >
      <ul className={CARD_LIST}>
        <ActionRow onClick={() => void exportAction.run()}>
          <RowContent emoji="⬇️" tint="teal" title="Export backup" hint="Save a file" />
        </ActionRow>
        {shareable && (
          <ActionRow onClick={() => void shareAction.run()}>
            <RowContent emoji="📤" tint="teal" title="Share backup" hint="Send to another app" />
          </ActionRow>
        )}
        <li>
          <label className={ROW}>
            <RowContent emoji="📂" tint="blue" title="Import from file" />
            <input
              type="file"
              accept=".json,application/json,text/plain"
              // The label's text includes the emoji, so the input gets a clean name of its own.
              aria-label="Import from file"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                // Reset so picking the same file again still fires change.
                e.target.value = '';
                if (file) void fileAction.run(file);
              }}
            />
          </label>
        </li>
        <ActionRow onClick={() => setShowPaste((open) => !open)} expanded={showPaste}>
          <RowContent emoji="📋" tint="blue" title="Paste a backup" />
        </ActionRow>
        {canUndo && (
          <ActionRow onClick={() => void undoAction.run()}>
            <RowContent emoji="↩️" tint="gray" title="Undo last import" />
          </ActionRow>
        )}
      </ul>

      {showPaste && (
        <div className="space-y-2">
          <textarea
            className="h-28 w-full rounded-2xl bg-white p-3 font-mono text-xs ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-emerald-600"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            aria-label="Paste backup"
          />
          <button
            type="button"
            disabled={!pasted.trim()}
            onClick={() => readImport(pasted)}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            Check
          </button>
        </div>
      )}

      {summary && pending && (
        <div role="alert" className="space-y-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
          <p>
            This backup has {summary.recipes} recipes, {summary.lists} lists, {summary.pantryStaples} pantry staples and{' '}
            {summary.aisleOverrides} aisle choices. Importing replaces everything on this device.
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => void importAction.run(pending)} disabled={importAction.pending} className="rounded-xl bg-amber-700 px-4 py-2 font-medium text-white disabled:opacity-50">
              Replace my data
            </button>
            <button type="button" onClick={() => setPending(null)} className="rounded-xl px-4 py-2 font-medium ring-1 ring-amber-300">Cancel</button>
          </div>
        </div>
      )}
      <ErrorNote message={exportAction.error ?? shareAction.error ?? fileAction.error ?? importAction.error ?? undoAction.error} />
      {message && <p role="status" className="text-sm text-slate-700">{message}</p>}
    </SettingsPage>
  );
}
```

In `src/ui/App.tsx`, add `import { BackupPage } from './screens/settings/BackupPage';` and the route:

```tsx
        <Route path="settings/backup" element={<BackupPage />} />
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run src/ui/screens/settings/BackupPage.test.tsx && npm run typecheck`
Expected: PASS (8 tests), no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens/settings src/ui/App.tsx
git commit -m "feat(settings): backup and restore page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Settings home replaces the old screen

**Files:**
- Create: `src/ui/screens/settings/summaries.ts`
- Test: `src/ui/screens/settings/summaries.test.ts`
- Rewrite: `src/ui/screens/SettingsScreen.tsx`
- Rewrite: `src/ui/screens/SettingsScreen.test.tsx`
- Delete: `src/ui/screens/SettingsErrors.test.tsx`
- Modify: `src/ui/screens/ListScreen.tsx`, `src/ui/screens/RecipeEditorScreen.tsx` (AI links)
- Modify: `src/ui/screens/ListAi.test.tsx:95`, `src/ui/screens/RecipeEditorAi.test.tsx:52`
- Modify: `e2e/backup.spec.ts`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: `SettingsRow`, `CARD_LIST`, `GROUP_LABEL` (Task 4), `THEME_LABEL` (Task 5), `UNIT_LABEL` (Task 5), `useStorageUsage` (Task 4), `getAiKeyStatus` from `src/app/ai.ts` (returns `{ savedFor: string | null; usableKey: string | null }`), `getProvider`.
- Produces: `pantrySummary(keys: readonly string[]): string`, `aisleSummary(count: number): string`, `aiSummary(status: { savedFor: string | null; usableKey: string | null } | undefined, providerName: string): string` from `summaries.ts`. `SettingsScreen` takes no props.

- [ ] **Step 1: Write the failing summary tests**

Create `src/ui/screens/settings/summaries.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { aiSummary, aisleSummary, pantrySummary } from './summaries';

describe('settings summaries', () => {
  it('lists up to three pantry staples, then a count', () => {
    expect(pantrySummary([])).toBe('None yet');
    expect(pantrySummary(['salt', 'water'])).toBe('salt, water');
    expect(pantrySummary(['a', 'b', 'c'])).toBe('a, b, c');
    expect(pantrySummary(['a', 'b', 'c', 'd', 'e'])).toBe('a, b, c +2');
  });

  it('counts aisles', () => {
    expect(aisleSummary(1)).toBe('1 aisle, your store order');
    expect(aisleSummary(11)).toBe('11 aisles, your store order');
  });

  it('describes the AI key state', () => {
    expect(aiSummary(undefined, 'DeepSeek')).toBe('Off');
    expect(aiSummary({ savedFor: null, usableKey: null }, 'DeepSeek')).toBe('Off');
    expect(aiSummary({ savedFor: 'deepseek', usableKey: 'sk' }, 'DeepSeek')).toBe('DeepSeek, key saved');
    expect(aiSummary({ savedFor: 'deepseek', usableKey: null }, 'OpenAI')).toBe('OpenAI, no key');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/ui/screens/settings/summaries.test.ts`
Expected: FAIL, cannot resolve `./summaries`.

- [ ] **Step 3: Implement summaries**

Create `src/ui/screens/settings/summaries.ts`:

```ts
/** "salt, black pepper, olive oil +2", or "None yet". */
export function pantrySummary(keys: readonly string[]): string {
  if (keys.length === 0) return 'None yet';
  const shown = keys.slice(0, 3).join(', ');
  return keys.length > 3 ? `${shown} +${keys.length - 3}` : shown;
}

export function aisleSummary(count: number): string {
  return `${count} ${count === 1 ? 'aisle' : 'aisles'}, your store order`;
}

/** "Off" with no key at all; otherwise whether the selected provider has a usable key. */
export function aiSummary(status: { savedFor: string | null; usableKey: string | null } | undefined, providerName: string): string {
  if (!status?.savedFor) return 'Off';
  return status.usableKey ? `${providerName}, key saved` : `${providerName}, no key`;
}
```

Run: `npx vitest run src/ui/screens/settings/summaries.test.ts`
Expected: PASS.

- [ ] **Step 4: Write the failing home tests**

Replace `src/ui/screens/SettingsScreen.test.tsx` with:

```tsx
// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { saveAiKey } from '../../app/ai';
import { createTestDb } from '../../test/db';
import { renderRoutes } from '../../test/render';
import { SettingsScreen } from './SettingsScreen';

const routes = [{ path: '/settings', element: <SettingsScreen /> }];

describe('Settings home', () => {
  it('shows the title and the app version', async () => {
    renderRoutes(routes, '/settings');
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    expect(await screen.findByText('CartCraft version test')).toBeInTheDocument();
  });

  it('links every row to its page', async () => {
    renderRoutes(routes, '/settings');
    const pages: [RegExp, string][] = [
      [/^Appearance/, '/settings/appearance'],
      [/^Units/, '/settings/units'],
      [/^Default servings/, '/settings/servings'],
      [/^Aisles/, '/settings/aisles'],
      [/^Pantry staples/, '/settings/pantry'],
      [/^AI helper/, '/settings/ai'],
      [/^Backup and restore/, '/settings/backup'],
      [/^Storage/, '/settings/storage'],
    ];
    for (const [name, href] of pages) expect(await screen.findByRole('link', { name })).toHaveAttribute('href', href);
  });

  it('summarises the current settings on the rows', async () => {
    const db = createTestDb();
    await saveAiKey(db, 'sk-test');
    renderRoutes(routes, '/settings', db);
    expect(await screen.findByRole('link', { name: /^Appearance/ })).toHaveTextContent('Match device');
    expect(screen.getByRole('link', { name: /^Units/ })).toHaveTextContent('US');
    expect(await screen.findByRole('link', { name: /^Default servings/ })).toHaveTextContent('4');
    expect(await screen.findByRole('link', { name: /^Aisles/ })).toHaveTextContent('11 aisles, your store order');
    expect(await screen.findByRole('link', { name: /^Pantry staples/ })).toHaveTextContent('black pepper, olive oil, salt +2');
    expect(await screen.findByRole('link', { name: /^AI helper/ })).toHaveTextContent('DeepSeek, key saved');
  });

  it('says AI is off without a key and groups the rows', async () => {
    renderRoutes(routes, '/settings');
    expect(await screen.findByRole('link', { name: /^AI helper/ })).toHaveTextContent('Off');
    const data = screen.getByRole('region', { name: 'Your data' });
    expect(within(data).getByRole('link', { name: /^Backup and restore/ })).toBeInTheDocument();
  });
});
```

Delete `src/ui/screens/SettingsErrors.test.tsx`. Its cases now live in `PreferencePages.test.tsx` (failed save), `AislesPage.test.tsx` (cleared name) and `BackupPage.test.tsx` (failed import, same file twice).

- [ ] **Step 5: Run to verify it fails**

Run: `npx vitest run src/ui/screens/SettingsScreen.test.tsx`
Expected: FAIL, no link named like `/^Appearance/` (the old screen has no rows).

- [ ] **Step 6: Write the home screen**

Replace `src/ui/screens/SettingsScreen.tsx` with:

```tsx
import { useLiveQuery } from 'dexie-react-hooks';
import { useId, type ReactNode } from 'react';
import { getAiKeyStatus } from '../../app/ai';
import { getProvider } from '../../services/providers';
import { useDb } from '../db';
import { useAisles, useSettings, useStorageUsage } from '../hooks';
import { getThemePref } from '../theme';
import { THEME_LABEL } from './settings/AppearancePage';
import { CARD_LIST, GROUP_LABEL } from './settings/SettingsPage';
import { SettingsRow } from './settings/SettingsRow';
import { aiSummary, aisleSummary, pantrySummary } from './settings/summaries';
import { UNIT_LABEL } from './settings/UnitsPage';

function Group({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className={GROUP_LABEL}>{title}</h2>
      <ul className={CARD_LIST}>{children}</ul>
    </section>
  );
}

/** Settings home: one row per page, each with a short summary of what is set. */
export function SettingsScreen() {
  const db = useDb();
  const settings = useSettings();
  const aisles = useAisles();
  const usage = useStorageUsage();
  const pantry = useLiveQuery(() => db.pantryStaples.orderBy('itemKey').primaryKeys(), [db]);
  const keyStatus = useLiveQuery(() => getAiKeyStatus(db), [db]);
  const provider = getProvider(settings.llm.providerId);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-[28px] font-bold tracking-tight text-slate-900">Settings</h1>

      <Group title="Shopping">
        <SettingsRow to="/settings/appearance" emoji="🎨" tint="gray" title="Appearance" value={THEME_LABEL[getThemePref()]} />
        <SettingsRow to="/settings/units" emoji="⚖️" tint="blue" title="Units" value={UNIT_LABEL[settings.unitSystem]} />
        <SettingsRow to="/settings/servings" emoji="🍽️" tint="amber" title="Default servings" value={String(settings.defaultServings)} />
        <SettingsRow to="/settings/aisles" emoji="🛒" tint="green" title="Aisles" summary={aisles ? aisleSummary(aisles.length) : undefined} />
        <SettingsRow to="/settings/pantry" emoji="🫙" tint="orange" title="Pantry staples" summary={pantry ? pantrySummary(pantry) : undefined} />
      </Group>

      <Group title="AI">
        <SettingsRow to="/settings/ai" emoji="✨" tint="purple" title="AI helper" summary={keyStatus ? aiSummary(keyStatus, provider.name) : undefined} />
      </Group>

      <Group title="Your data">
        <SettingsRow to="/settings/backup" emoji="💾" tint="teal" title="Backup and restore" summary="Export, import, share" />
        <SettingsRow to="/settings/storage" emoji="📦" tint="gray" title="Storage" value={usage ?? undefined} />
      </Group>

      <p className="text-center text-xs text-slate-400">CartCraft version {__APP_VERSION__}</p>
    </div>
  );
}
```

`db.pantryStaples.orderBy('itemKey').primaryKeys()` returns the keys sorted, so the seeded staples read "black pepper, olive oil, salt +2".

- [ ] **Step 7: Point the AI links at the AI page**

In `src/ui/screens/ListScreen.tsx` and `src/ui/screens/RecipeEditorScreen.tsx`, change `<Link to="/settings" className="underline">Add an AI key in Settings</Link>` to `<Link to="/settings/ai" className="underline">Add an AI key in Settings</Link>`.

In `src/ui/screens/ListAi.test.tsx:95` and `src/ui/screens/RecipeEditorAi.test.tsx:52`, change `toHaveAttribute('href', '/settings')` to `toHaveAttribute('href', '/settings/ai')`.

- [ ] **Step 8: Update e2e**

In `e2e/backup.spec.ts`:
- Change the first `await page.goto('/settings');` to `await page.goto('/settings/ai');`.
- After the `Remove key` visibility check, add `await page.goto('/settings/backup');`.
- Change `page.getByRole('button', { name: 'Export' })` to `page.getByRole('button', { name: /^Export backup/ })`.
- Change `await second.goto('/settings');` to `await second.goto('/settings/backup');`.
- Change `second.getByLabel('Import')` to `second.getByLabel('Import from file')`.

`e2e/headers.spec.ts` and `e2e/update.spec.ts` still find "CartCraft version" on `/settings`; no change.

- [ ] **Step 9: Changelog**

Add to the `### Changed` group under `## [Unreleased]` in `CHANGELOG.md`:

```markdown
- Settings is a short page of rows, each opening its own page: Appearance, Units, Default servings, Aisles, Pantry staples, AI helper, Backup and restore, and Storage. Each row shows what is set.
- Aisles are reordered by dragging a handle (or with the arrow keys) instead of up and down buttons.
- The AI provider is picked from a list instead of a dropdown, and "Add an AI key in Settings" links straight to the AI helper page.
```

- [ ] **Step 10: Run everything**

Run: `npm test && npm run typecheck`
Expected: every test passes, with no type errors. Run `grep -rn "SettingsErrors\|SettingsAi.test" src` and confirm it finds nothing.

- [ ] **Step 11: Run e2e**

Run: `npm run e2e`
Expected: all specs pass. Docker or a browser download is not needed if Playwright browsers are already installed. If they are not, report that and skip this step.

- [ ] **Step 12: Click through in the browser**

Run `npm run dev` and open `http://localhost:5173/settings` in the browser pane at mobile size and in dark mode. Check that:
- every row opens its page, and "‹ Settings" comes back;
- the values on the rows update after you change Theme, Units and Default servings;
- a list shows emoji badges and the ⋯ menu works.

Stop the dev server.

- [ ] **Step 13: Commit**

```bash
git add -A src/ui/screens e2e/backup.spec.ts CHANGELOG.md
git commit -m "feat(settings): settings home with a page per section

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

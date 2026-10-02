# Settings Redesign, Emoji Aisle Badges and List Menu

Date: 2026-10-02. Approved in brainstorming with mockups (`settings-structure.html` option A, `subpages-and-list.html`).

## Goal

Bring Settings in line with the calm redesign of Recipes and Lists (0.3.0): a Settings home made of grouped white cards with tinted emoji badges, where every row opens its own page. In the same change, replace the line-icon aisle badges with emoji, and move the list header actions (Rename, Copy, Keep screen on) into one ⋯ menu.

Pure UI change plus one small app function. No database schema, backup format or domain changes.

## Out of scope

- The ingredient parser fixes for WP Recipe Maker lines (nested brackets, "2 cups / 400g") and the clearer AI error messages. They are separate bug fixes on their own branch.
- New settings. Every page shows only what Settings has today.

## Settings home (`/settings`)

Title "Settings", then three groups. Each row: tinted emoji badge, name, optional one-line summary or value on the right, and a chevron. The whole row is a link to its page.

| Group | Row | Badge | Right side / summary |
|---|---|---|---|
| Shopping | Appearance | 🎨 gray | "Match device", "Light" or "Dark" |
| Shopping | Units | ⚖️ blue | "US" or "Metric" |
| Shopping | Default servings | 🍽️ amber | the number |
| Shopping | Aisles | 🛒 green | summary "N aisles, your store order" |
| Shopping | Pantry staples | 🫙 orange | summary: first three staples, then "+N" (or "None yet") |
| AI | AI helper | ✨ purple | summary "<Provider>, key saved" or "<Provider>, no key" or "Off" when no key is saved at all |
| Your data | Backup and restore | 💾 teal | summary "Export, import, share" |
| Your data | Storage | 📦 gray | the usage, e.g. "2.1 MB" (blank until known) |

Footer: "CartCraft version X.Y.Z" in small muted text (e2e checks for "CartCraft version").

## Sub-pages

Each sub-page starts with a back link "‹ Settings" (to `/settings`), then the page title as `h1`, then an optional hint line. Changes save at once; no Save buttons except where they exist today (API key).

| Route | Page | Content |
|---|---|---|
| `/settings/appearance` | Appearance | One card, three rows: Match my device, Light, Dark. The chosen row shows a tick. Rows are radio inputs (`name="theme"`) styled as rows, so they keep the radio role and labels. |
| `/settings/units` | Units | One card, two rows: "US" (hint "cups, oz, lb"), "Metric" (hint "ml, g, kg"). Radio inputs styled as rows. |
| `/settings/servings` | Default servings | Hint "New recipes start at this many servings when the recipe doesn't say." A card with a large − / number / + stepper. Keeps a number input labelled "Default servings" for typing, with the same draft rules as today. Reuse `ServingsStepper` if its API fits; otherwise a local stepper with the same look. |
| `/settings/aisles` | Aisles | Hint "Lists follow this order. Drag to match your store, tap a name to rename." One card, one row per aisle: emoji badge, name input (label "Name of <aisle>", same blur-to-save and blank-restores behavior), drag handle. |
| `/settings/pantry` | Pantry staples | Hint "These go in a "Check pantry" section instead of an aisle." A card of chips (remove button "Remove <staple>"), then the add form (input "New pantry staple", button "Add"). |
| `/settings/ai` | AI helper | The existing `AiSettings` behavior restyled: intro hint; Provider as a tick list in a card (radio inputs, group label "Provider"); Model field (label "Model"); key card ("Key saved for <Provider>" with "Remove key", or the API key input with "Save key"); "Test connection" button; mismatch warning; status and errors. |
| `/settings/backup` | Backup and restore | Hint about data living on this device and the AI key never being included. One card of action rows with badges: Export backup (⬇️), Share backup (📤, only when sharing files works), Import from file (📂, a file input labelled "Import"), Paste a backup (📋, toggles the paste box), Undo last import (↩️, only when available). Below: paste box, "replace everything?" confirm, messages and errors, all as today. |
| `/settings/storage` | Storage | One card: "Used" with the size, "Protected" with the persist status sentence, "Version" with the app version. |

Unknown `/settings/*` paths fall through to the existing catch-all redirect.

### Aisle reordering

- Pointer drag on the handle (pointer events, no new dependency). While dragging, the row follows the pointer and the others shift; on release the new order is saved.
- The handle is a button labelled "Reorder <aisle>". When focused, ArrowUp and ArrowDown move the aisle one place (using the existing `moveAisle`) and keep focus on the handle. A visually hidden live region announces "<aisle> moved to position N of M".
- New app function `moveAisleTo(db, id, index)` in `src/app/settings.ts`: moves an aisle to an index and renumbers `order` for all aisles in one transaction. No-op for an unknown id; the index is clamped.

## Emoji aisle badges

`src/ui/aisleIcons.ts` maps aisle ids to an emoji instead of a Lucide icon; tints are unchanged. `AisleBadge` renders the emoji (decorative, `aria-hidden`), sized to the existing `sm` and `md` boxes.

| Aisle id | Emoji | Tint |
|---|---|---|
| produce | 🥕 | green |
| meat-seafood | 🥩 | red |
| dairy-eggs | 🥛 | blue |
| bakery | 🥐 | amber |
| pantry | 🌾 | orange |
| canned | 🥫 | teal |
| spices-oils | 🫒 | rose |
| frozen | 🧊 | sky |
| beverages | 🥤 | purple |
| household | 🧻 | gray |
| other and unknown ids | 🛒 | gray |
| check-pantry | 🫙 | gray |

`aisleIcon` becomes `aisleEmoji(aisleId): string`. The badges show everywhere they do now (list section headers, the Check pantry header, aisle filter pills) and on the Aisles settings page.

## List ⋯ menu

On the list screen the Rename and Copy icon buttons and the "Keep screen on" checkbox are replaced by one button labelled "List options" (⋯) in the header. It opens a small menu card anchored under it:

- ✏️ Rename list (opens the existing rename dialog)
- 📋 Copy list as text (same as today; "Copied to clipboard" status still shows on the page)
- ☀️ Keep screen on, with a switch (only when the wake lock is supported). It is a `menuitemcheckbox` with `aria-checked`, and toggling it does not close the menu.

Rename and Copy close the menu. Escape and a click outside close it and return focus to the ⋯ button. The menu uses `role="menu"`, items use `menuitem` / `menuitemcheckbox`, and ArrowUp/ArrowDown move between items. The accessible names "Rename list", "Copy list as text" and "Keep screen on" stay the same; tests open the menu first.

## Structure

| File | Change |
|---|---|
| `src/ui/App.tsx` | Nested settings routes. |
| `src/ui/screens/SettingsScreen.tsx` | Becomes the Settings home only. |
| `src/ui/screens/settings/` (new folder) | One file per sub-page: `AppearancePage.tsx`, `UnitsPage.tsx`, `ServingsPage.tsx`, `AislesPage.tsx`, `PantryPage.tsx`, `AiPage.tsx`, `BackupPage.tsx`, `StoragePage.tsx`, plus `SettingsPage.tsx` (back link, title, hint) and `SettingsRow.tsx` (badge, name, summary, chevron; link or button). |
| `src/ui/components/AiSettings.tsx` | Restyled to the page layout; logic unchanged. |
| `src/ui/aisleIcons.ts`, `AisleBadge.tsx` | Emoji instead of icons. |
| `src/ui/components/Menu.tsx` (new) | The ⋯ menu: button, popover, keyboard and outside-click handling. |
| `src/ui/screens/ListScreen.tsx` | Header uses `Menu`. |
| `src/app/settings.ts` | `moveAisleTo`. |
| `CHANGELOG.md` | Changed lines under Unreleased. |
| `.gitignore` | Add `.superpowers/`. |

Storage usage (`navigator.storage.estimate`) moves to a small hook in `src/ui/hooks.ts` used by the home row and the Storage page. The backup logic (export, share, import, paste, undo) moves unchanged into `BackupPage`.

## Error handling

Unchanged per action: each page keeps its own `useAsyncAction` and shows `ErrorNote` next to the control that failed. The "Units and servings" region that a test uses no longer exists; that test checks the error on the Units page instead.

## Testing

- Existing Settings tests move to the page they cover (render the route, for example `/settings/units`) and keep their assertions. Tests for removed names change: "Move X up" becomes the Reorder handle with ArrowUp.
- New tests: home rows link to each page and show the right summaries; `moveAisleTo` (start, middle, end, clamp, unknown id); aisle handle keyboard reorder and the announcement; drag reorder through pointer events on the handle; `aisleEmoji` mapping and the unknown-id fallback; the list menu (open, items, Keep screen on toggle stays open, Escape returns focus, Rename opens the dialog, Copy shows "Copied").
- e2e: `backup.spec.ts` goes to `/settings/ai` for the key and `/settings/backup` for export and import. `headers.spec.ts` still finds "CartCraft version" on the Settings home.

## Constraints

- No em dashes in code comments, docs or UI copy.
- No hex colors or arbitrary color values in JSX; use the slate, emerald, amber, red ramps and `tint-*` tokens.
- CSP `style-src 'self'`: no `<style>` tags or inline style attributes in static HTML. React `style` is allowed only for the drag offset of the row being dragged.
- Emoji and badges are decorative (`aria-hidden="true"`).
- UI test files start with `// @vitest-environment jsdom`.

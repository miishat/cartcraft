# Changelog

All notable changes to CartCraft are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed
- Aisles on shopping lists show a food emoji (🥕 🥩 🥛 🥐 ...) on their coloured badge instead of a line icon.

## [0.3.0] - 2026-10-02

### Added
- Recipes have an emoji cover picked from the title, on the recipe list and the recipe page.
- Aisle buttons at the top of a shopping list show one aisle at a time, with how many items are left in each.
- Shopping lists show a progress bar with how many items are in the cart, on the list itself and in Lists.
- Each aisle on a shopping list now has its own icon next to its name.
- Recipes can be opened in the app (View on the recipe list): ingredients, a servings stepper that scales the amounts, and the source link.
- Dark theme. Settings has an Appearance choice: match the device, light or dark.

### Changed
- Editing a recipe now starts from the recipe page; the Edit link is no longer on each row of the recipe list.
- The recipe list is one card with a servings stepper on each selected recipe, and the Build list bar shows how many recipes and ingredients you picked.
- The add item box on a shopping list now floats at the bottom of the screen, within thumb reach.
- Shopping lists are grouped into cards, each aisle with its icon on a coloured badge, and quantities sit in a small pill on the right of each item.
- Colours are warmer: cream backgrounds and brown-grey text instead of cool grey.
- The scrollbar now follows the app colours in both themes.
- On a recipe, the Save button is just "Save" and Delete is a proper outlined button with a bin icon.
- Renaming a list and deleting a list or recipe now use an in-app dialog instead of the browser's pop-up.
- The browser tab and installed app icon now use the dark chef hat from the app header on a white tile instead of a green cart.
- Settings is grouped into Shopping, AI helper and Your data.
- The data buttons in Settings share one style and are named Export, Import, Share and Paste; Paste now opens the paste box.

## [0.2.0] - 2026-10-01

### Added
- On iPhone and iPad in Safari, a banner explains that Safari and the installed app keep separate data and how to install CartCraft first.
- "Keep screen on" on shopping lists stops the phone from dimming while you shop (where the browser supports it; on iPhone, including the installed app from iOS 18.4).
- Installable app that works offline after the first visit. When a new version is ready, a notice offers to reload (nothing changes until you choose), and Settings shows the version.
- Security headers: a strict Content Security Policy that allows AI requests only to the four supported providers, plus caching rules so new versions are picked up.
- Shopping lists can ask AI to sort items left in Other into aisles (remembered for next time, never overriding your own choices) and to suggest swaps and leftover tips.
- "Clean up with AI" turns messy pasted recipes into ingredient lines, and "Try with AI" reads pages that have no recipe data. Every AI line goes through the normal review, and numbers that are not in the source are flagged.
- Optional AI helper in Settings: choose DeepSeek, OpenRouter, OpenAI or Groq, enter your own key (kept on this device, never included in backups) and test the connection.
- The AI key is used only with the provider it was saved for, and the AI never changes your base servings unless the number appears in the recipe text.
- Import a recipe from a link: paste a recipe page URL and CartCraft reads the recipe data the site publishes. If a site blocks the import or has no recipe data, the form switches to pasting the ingredients.

### Changed
- Editing a recipe now starts from the recipe page; the Edit link is no longer on each row of the recipe list.
- The app and recipe import are served by one Cloudflare Worker, and recipe import uses Cloudflare's rate limiter (10 imports per minute per address).

### Fixed
- Backups with duplicate entries are rejected with a clear message instead of failing during import, and a backup without the Other aisle no longer hides list items.
- Ingredient parsing: "4 oz. can tomato paste" is read as one 4 oz can, "or to taste" and leading "x2" are understood, and bare units ("2 cups"), alternatives with their own amount and zero amounts are flagged for review. Zero amounts no longer display as "pinch".
- Saving, deleting and building lists now show an inline message when something goes wrong instead of failing silently.
- Editing a list item keeps its notes. List and Settings actions show an inline message when they fail, "Copied" clears after a few seconds, Safari backup downloads are no longer cut off, the same backup file can be picked twice, and clearing an aisle name restores it.

## [0.1.0] - 2026-10-01

### Added
- Domain core: ingredient line parser, unit-aware scaling and formatting, list merging, aisle classifier with a starter dictionary, recipe yield parsing and JSON-LD recipe extraction.
- Local IndexedDB storage (Dexie) with seeded aisles, pantry staples and settings.
- Recipe add and edit with a review table for parsed ingredient lines.
- Recipe selection with per-recipe servings, building saved shopping list snapshots.
- Shopping mode: aisle grouping, pantry section, check-off with undo, item edit, move and delete, ad-hoc items, rename, copy as text.
- Settings: units, default servings, pantry staples, aisle rename and reorder, storage persistence status.
- Backup export and validated import with automatic snapshot and "Undo last import". API keys are never exported.
- App shell with routing, responsive navigation and Tailwind CSS 4.

### Changed
- Editing a recipe now starts from the recipe page; the Edit link is no longer on each row of the recipe list.
- Replaced the AI Studio UI with the CartCraft app. README reset.

### Removed
- Gemini and AI Studio code, the Tailwind CDN and the import map.

### Fixed
- Not-found states for missing lists and recipes; clear error when building a list fails.

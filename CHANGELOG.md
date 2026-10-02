# Changelog

All notable changes to CartCraft are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Shopping lists can ask AI to sort items left in Other into aisles (remembered for next time, never overriding your own choices) and to suggest swaps and leftover tips.
- "Clean up with AI" turns messy pasted recipes into ingredient lines, and "Try with AI" reads pages that have no recipe data. Every AI line goes through the normal review, and numbers that are not in the source are flagged.
- Optional AI helper in Settings: choose DeepSeek, OpenRouter, OpenAI or Groq, enter your own key (kept on this device, never included in backups) and test the connection.
- The AI key is used only with the provider it was saved for, and the AI never changes your base servings unless the number appears in the recipe text.
- Import a recipe from a link: paste a recipe page URL and CartCraft reads the recipe data the site publishes. If a site blocks the import or has no recipe data, the form switches to pasting the ingredients.

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
- Replaced the AI Studio UI with the CartCraft app. README reset.

### Removed
- Gemini and AI Studio code, the Tailwind CDN and the import map.

### Fixed
- Not-found states for missing lists and recipes; clear error when building a list fails.

# Changelog

All notable changes to CartCraft are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Fixed
- Ingredient parsing: "4 oz. can tomato paste" is read as one 4 oz can, "or to taste" and leading "x2" are understood, and bare units ("2 cups"), alternatives with their own amount and zero amounts are flagged for review. Zero amounts no longer display as "pinch".
- Saving, deleting and building lists now show an inline message when something goes wrong instead of failing silently.

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

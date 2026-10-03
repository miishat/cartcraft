# Changelog

All notable changes to CartCraft are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed
- Once swaps & tips are added to a list, the "Add swaps & tips" button goes away and the Swaps & tips section gets a Regenerate button instead.
- After "Clean up with AI" runs in the recipe editor, the button hides until you change the ingredient text.
- The Build list bar is now "Build List" in a light accent colour, with the CartCraft logo.
- Saved lists on the Lists tab are cards showing their recipes' emoji, recipe names, an items count (green when everything is in the cart) and the date.
- Settings names are in title case with "&": AI Helper, Default Servings, Pantry Staples, Backup & Restore. The footer reads "CartCraft 0.4.0" instead of "CartCraft version 0.4.0".
- The bottom tabs on phones are larger emoji with no text (🍳 Recipes, 🛒 Lists, ⚙️ Settings) to match the aisle badges. Inactive tabs are greyed out and the active one has a green dot under it.
- New logo: a shopping cart whose basket is a recipe card, green on a white tile. It replaces the chef hat in the app, the browser tab and the installed app icon.

### Fixed
- The "Checked ... Undo" and app-update pop-ups now use the app theme (card colours, green action) instead of a fixed dark bar.
- On phones, tapping into a text field (such as the recipe link box) no longer zooms the page in.
- In metric, spoon and cup amounts of solids (butter, herbs, flour, sugar, cheese, spices, chopped vegetables and more) now show in grams instead of ml. Liquids like milk and broth stay in ml.
- Installed apps (such as on the Windows taskbar) now pick up the new logo instead of keeping the old cached icon. You may need to unpin and re-pin the app once.

## [0.4.0] - 2026-10-03

### Added
- Six colour palettes in Settings > Appearance: Basil, Tomato, Blueberry, Saffron, Plum and Paper. Each works in light and dark.
- Building a list asks for its name, filled in as "Groceries, Fri Oct 2", with suggestions from the recipes you picked (such as "Biryani + Tacos") and the day ("Weekend shop").
- Recipe pages show the method steps from the recipe site, grouped by section, with a View original link. Recipes imported earlier fetch their steps the first time you open them.

### Changed
- The CartCraft logo has rounded corners in the app, the browser tab and the installed app icon.
- The Appearance mode choice "Match my device" is now called "System".
- On phones the logo bar at the top is gone. Each screen has its own header with its title, a way back and its actions, such as + Add on Recipes and ⋯ on a list.
- Recipes no longer shows "Pick recipes for your next list", and its Add recipe button is now "+ Add".
- On phones, the ⋯ menu and each item's options open as a sheet from the bottom of the screen instead of in place. Swipe it down or tap outside to close.
- Aisles on shopping lists show a food emoji (🥕 🥩 🥛 🥐 ...) on their coloured badge instead of a line icon.
- Rename list, Copy list as text and Keep screen on moved into a ⋯ menu at the top of a shopping list.
- Settings is a short page of rows, each opening its own page: Appearance, Units, Default servings, Aisles, Pantry staples, AI helper, Backup and restore, and Storage. Each row shows what is set.
- Aisles are reordered by dragging a handle (or with the arrow keys) instead of up and down buttons.
- The AI provider is picked from a list instead of a dropdown, and "Add an AI key in Settings" links straight to the AI helper page.
- The Default servings number field now ignores values above 99.
- Settings rows, Backup buttons and choice lists show a clear outline when reached with the keyboard.
- In US units, weights of half a pound or more show in pounds (rounded to a quarter pound) instead of ounces, for example "3/4 lb" instead of "13 1/4 oz".
- A recipe whose source is not a web address no longer shows that source text on its page.
- Scrollbars are hidden everywhere in the app; scrolling works as before.
- The add item bar on a shopping list stands out from the list: a stronger outline, a filled + button on the left, and the list fades out behind it.

### Fixed
- The "Checked ... Undo" and app-update pop-ups now use the app theme (card colours, green action) instead of a fixed dark bar.
- Recipes saved before this version are re-read once with the fixed ingredient reader, so lines like "Chicken thighs )" are repaired. Shopping lists already built are not changed.
- Add swaps & tips works with replies that have extra text, too many suggestions or a long thinking step, and AI errors now say what went wrong (a rejected model name, or a reply cut off).
- Imported ingredient lines with brackets inside brackets (common on RecipeTin Eats) no longer show stray ")" or "(" in the name or notes, "Note 1" references are dropped, and a repeated amount in other units such as "(1.5 lb)" is no longer shown as a note.

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
- The "Checked ... Undo" and app-update pop-ups now use the app theme (card colours, green action) instead of a fixed dark bar.
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
- The "Checked ... Undo" and app-update pop-ups now use the app theme (card colours, green action) instead of a fixed dark bar.
- Not-found states for missing lists and recipes; clear error when building a list fails.

# Recipe data domain research: parsing, merging, aisles, import, LLM

Research date: 2026-10-01. Sources are primary (source code at default-branch HEAD, official docs, specs) unless noted. Line references are to the file as read on that date and may drift.

Repos read: Mealie (`mealie-next`), Tandoor (`develop`), KitchenOwl (`main`), Grocy (`master`), recipe-scrapers (`main`), ingredient-parser-nlp (`master`, v2.8.0 on PyPI), NYT ingredient-phrase-tagger (archived), parse-ingredient (npm v3.0.0), numeric-quantity (v3.3.3), format-quantity (v3.2.0), recipe-ingredient-parser-v3 (v1.5.0), recipe-scrapers JS port (npm `recipe-scrapers` v3.1.0).

---

## Top takeaways for CartCraft

1. **DO build a rule-based TS parser with a fixed pipeline: normalize -> extract amount -> extract unit -> split item/notes -> classify.** Every mature project except the ML one uses this shape (Tandoor's parser and Mealie's "brute" parser are the same code). The ML model (ingredient-parser-nlp) is Python + NLTK + a trained model and cannot run in a static PWA.
2. **DO use `numeric-quantity` (MIT) for number parsing and consider `parse-ingredient` (MIT, actively maintained) as the amount/unit front end.** It already handles unicode fractions, mixed numbers, ranges ("1-2", "1 to 2", "1 or 2"), `T` vs `t`, group headers ("For the sauce:"), "x2" trailing quantities and "juice of 3 lemons". It does NOT split notes, does not handle "(14 oz) can" package sizes specially, and treats `large` as a unit by default. CartCraft needs its own post-processing layer on top either way.
3. **DON'T round at parse time.** `parse-ingredient` and `numeric-quantity` round to 3 decimals by default (`1/3` -> `0.333`); pass `round: false`, or store rationals. Three thirds of a cup must sum to exactly 1 cup.
4. **DO always keep the raw line and never drop text.** Mealie's LLM prompt rule "All text must appear somewhere" and Tandoor's "unit_note" fallback both exist because silent text loss is the worst parser failure. Anything unparsed goes to `notes`.
5. **DO make merge identity = normalized item key + compatible unit dimension.** Mealie merges only when `food_id` matches AND units are convertible; otherwise lines stay separate. Tandoor groups by food and shows one amount per unit inside the group. CartCraft's "Garlic: 2 cloves + 1 tbsp" is exactly Tandoor's and AnyList's display model.
6. **DON'T fuzzy-merge items.** "red onion" vs "onion", "green onion" vs "onion", "garlic powder" vs "garlic" must NOT merge automatically. Merge only on exact normalized key or an explicit alias in the dictionary (user corrections remembered).
7. **DO sum in base units (mL, g, count) and convert only for display**, choosing the largest unit that yields a quantity >= 1 (Mealie's rule), then snap to kitchen fractions for US display.
8. **DO treat `oz` as mass and `fl oz` as volume; never silently convert between them.** Mealie guesses "oz means fl oz" when merging with a volume; with CartCraft's no-density rule, emit the combined text line instead.
9. **DO pin cup/tbsp definitions per unit system** (US cup 236.6 mL, US tbsp 14.79 mL; metric cup 250 mL, Australian tbsp 20 mL, imperial pint 568 mL). Parse `cup` as US by default; offer a "recipe source is UK/AU" hint later if needed.
10. **DO scale only the primary quantity, never the package size inside parentheses** ("1 (14 oz) can" x2 -> 2 cans, still 14 oz each). AnyList documents the same rule.
11. **DO round counts up for shopping** (1.5 eggs -> buy 2) and never scale "to taste", "pinch", "dash" lines (they become quantity-less pantry checks).
12. **URL import: walk every `<script type="application/ld+json">`, handle arrays, `@graph`, `mainEntity`, `@type` arrays, nested lists of ingredients and `PropertyValue` ingredients, and HTML-unescape repeatedly.** This is what recipe-scrapers does. Microdata is a secondary fallback; LLM is last.
13. **`recipeYield` is messy: number, string, or array like `["4", "4 servings"]` or `["6", "24 cookies"]`.** Prefer the bare number / "servings" entry for base servings; keep the other string as yield text. Default to 4 (or ask) when absent, not 1.
14. **LLM: use JSON mode + client-side schema validation (zod/valibot), same-length/same-order arrays, and cross-check every LLM quantity against the deterministic parser.** DeepSeek only offers `json_object` mode (not strict schemas) and documents occasional empty responses, so validation and fallback are mandatory, as KitchenOwl and Mealie both do.
15. **License: do not copy code or seed data from Mealie, KitchenOwl (AGPL-3.0) or Tandoor (AGPL-3.0 + Commons Clause).** MIT code (parse-ingredient, numeric-quantity, format-quantity, recipe-scrapers, ingredient-parser-nlp, Grocy) is reusable with attribution. Open Tandoor Data (ODbL/DbCL) is usable with attribution and share-alike obligations; USDA FDC is CC0.

---

## 1. Ingredient line parsing

### 1.1 How the mature projects do it

**Tandoor `IngredientParser` (rule-based, token heuristics).** [cookbook/helper/ingredient_parser.py](https://github.com/TandoorRecipes/recipes/blob/develop/cookbook/helper/ingredient_parser.py)
- Rejects empty lines and lines > 512 chars; strips leading junk (`,.-_=+#*|\/`).
- Moves a trailing "amount unit" to the front for languages that write "Mehl 200 g".
- Moves an early parenthetical to the end (regex `(.){1,6}\s\((.[^\(\)])+\)\s`) so "1 (14 oz) can tomatoes" becomes "1 can tomatoes (14 oz)" and the parenthetical becomes a note.
- Ranges: `"10.5 - 200 g XYZ"` is rewritten to the minimum amount plus the range in the note (`"10.5 g XYZ (10.5 - 200)"`). Only the spaced " - " form is handled here; a glued "2-3" token falls into `parse_amount`, which treats a unit starting with `-` or `(` as "likely an alternative" and puts the whole token into the note.
- Splits glued amount+unit ("200g" -> "200 g").
- Alternate measurement patterns "1 cup / 240 ml flour" and "1 cup (240 ml) flour" keep the first measurement and move the second to the note (`_ALTERNATE_MEASUREMENT_PATTERNS`).
- Token walk: token[0] is amount (digits, `.`/`,` decimals, `a/b`, single unicode vulgar fraction via `unicodedata.decomposition`); token[1] is tried as a fraction for "1 1/2"/"1 ½"; next token is the unit unless it ends with a comma; the rest is food. Food/note split: trailing `( ... )` is the note, otherwise everything after the first token ending in `,` `;` `:` is the note.
- User "automations" (regex/alias rules per space: food alias, unit alias, "never unit", transpose words) run before matching. This is Tandoor's equivalent of a personal dictionary.
- Food and unit lookups match `name` OR `plural_name` exactly; unknown ones are auto-created.

**Mealie "brute" parser** is a near line-for-line copy of Tandoor's algorithm. [mealie/services/parser_services/brute/process.py](https://github.com/mealie-recipes/mealie/blob/mealie-next/mealie/services/parser_services/brute/process.py), helpers in [parser_utils/string_utils.py](https://github.com/mealie-recipes/mealie/blob/mealie-next/mealie/services/parser_services/parser_utils/string_utils.py):
- `convert_vulgar_fractions_to_regular_fractions` inserts a space before each replacement so "1½" becomes "1 1/2" not "11/2".
- `extract_quantity_from_string` tries mixed fraction, then fraction, then decimal, anywhere in the string. It is used as the "ground truth" quantity when scoring LLM output (see section 5).
- `remove_footnote_markers` strips trailing `*` from item names (sites footnote ingredients).
- If token[0] is not a number, it searches the first 3 tokens for a known unit ("a tblsp salt").
- Defaults `amount = 1.0` in the model, but the parse path returns 0 for no quantity.

**Mealie NLP parser = ingredient-parser-nlp.** [mealie/services/parser_services/ingredient_parser.py](https://github.com/mealie-recipes/mealie/blob/mealie-next/mealie/services/parser_services/ingredient_parser.py) (`NLPParser`, line ~98) calls `ingredient_parser.parse_ingredient(text, custom_units=...)` and maps: first amount -> quantity/unit, `CompositeIngredientAmount` extra parts ("1 lb 2 oz") -> note, size/preparation/comment/purpose -> joined note with parentheses stripped, second and later names (from "stock or broth") -> substitutions. Mealie keeps the original text and a per-field confidence. KitchenOwl uses the same library as its non-LLM path: [backend/app/service/ingredient_parsing.py](https://github.com/TomBursch/kitchenowl/blob/main/backend/app/service/ingredient_parsing.py).

**ingredient-parser-nlp (strangetom, MIT).** Sequence-labelling model trained on ~81k labelled sentences (NYT, allrecipes, bbc, cookstr, others); reported 94.94% sentence-level and 98.03% word-level accuracy. [README](https://github.com/strangetom/ingredient-parser/blob/master/README.md), [data](https://github.com/strangetom/ingredient-parser/blob/master/docs/source/explanation/data.rst). Its *normalisation* pipeline is the best written spec of what a rule-based TS parser must also do ([normalisation.rst](https://github.com/strangetom/ingredient-parser/blob/master/docs/source/explanation/normalisation.rst)):
1. Remove price annotations "($1.99)".
2. Replace en/em dashes with "-".
3. `html.unescape` fraction entities (`&frac12;`).
4. Unicode fractions -> "a/b"; insert a space unless the previous char is a hyphen ("1½" -> "1 1/2", but "½-¾" -> "1/2-3/4").
5. "1 and 1/2" -> mixed number.
6. Keep fractions as a single token.
7. Force a space between quantity and unit; "2-inch"/"1-cup" hyphen joins become spaces.
8. Strip trailing periods from units ("tbsp.").
9. Normalize ranges "1 to 2", "1- to 2-", "1 or 2" -> "1-2".
10. "5 oz - 8 oz" -> "5-8 oz" (unit synonyms considered).
11. "1 x" -> "1x" multiplier.
12. Singularize units after tokenizing, re-pluralize on output.

Its *postprocessing* ([postprocessing.rst](https://github.com/strangetom/ingredient-parser/blob/master/docs/source/explanation/postprocessing.rst)) defines the output model worth copying:
- Amount = `quantity`, `quantity_max` (range), `unit`, plus flags `APPROXIMATE` ("about", "approx", "~", "generous"), `SINGULAR` ("each"; also the inner amount of "2 14 ounce cans"), `RANGE`, `MULTIPLIER` ("1x"), `PREPARED_INGREDIENT` ("1 tbsp chopped nuts" vs "1 tbsp nuts, chopped").
- "2 14 ounce cans coconut milk" -> amounts `[2 cans, 14 ounce (SINGULAR)]`.
- "1lb 2oz pecorino" -> one `CompositeIngredientAmount`.
- Implicit quantity 1 for "15 oz can black beans" and "Rosemary sprig (optional)", guarded by "unit is singular and no indefinite quantifier (few, some) precedes it".
- Multiple names: "8 ounces whole yellow or red bell pepper" -> "whole yellow bell pepper" and "whole red bell pepper" via NAME_MOD / NAME_VAR / NAME_SEP labels.
- Quantities are `fractions.Fraction`, not floats.
- Default volumetric system is US customary; `volumetric_units_system` can switch cup/tbsp to imperial, metric, australian, japanese variants ([en/_utils.py](https://github.com/strangetom/ingredient-parser/blob/master/ingredient_parser/en/_utils.py)).

Useful constants to mirror in TS ([en/_constants.py](https://github.com/strangetom/ingredient-parser/blob/master/ingredient_parser/en/_constants.py)): `UNITS` plural->singular map; `AMBIGUOUS_UNITS` (cloves, leaves, slabs, wedges, ribs, gram, glass, stem, pound: "ground cloves", "bay leaves", "gram flour", "glass noodles", "stem ginger", "pound cake"); `SIZES` (large, medium, small, jumbo, extra-large...); `UNIT_SYNONYMS`; `INDEFINITE_QUANTIFIERS` (couple, few, several, some). Case rules: `T`/`Tb`/`Ts` -> tablespoon, `t`/`ts` -> teaspoon (case-sensitive regexes in `_utils.py`).

**NYT ingredient-phrase-tagger** (Apache-2.0, archived since 2018): CRF++ model tagging QTY/UNIT/NAME/COMMENT/OTHER; ships a ~180k-line 2015 snapshot CSV of NYT Cooking ingredient lines. Historically important, not usable in a browser. [README](https://github.com/nytimes/ingredient-phrase-tagger/blob/master/README.md). The CSV is useful as an offline regression corpus (Apache-2.0 repo license; underlying recipe text is NYT content, so do not ship it in the app).

**parse-ingredient (npm, MIT, v3.0.0, ~5.5k weekly downloads).** [README](https://github.com/jakeboone02/parse-ingredient/blob/main/README.md), [units](https://github.com/jakeboone02/parse-ingredient/blob/main/src/constants.ts), [test fixtures](https://github.com/jakeboone02/parse-ingredient/blob/main/src/parseIngredientTests.ts)
- Output: `quantity`, `quantity2` (range upper), `unitOfMeasureID`, `unitOfMeasure`, `description`, `isGroupHeader`, optional `meta.sourceText`.
- Handles mixed numbers and vulgar fractions (via numeric-quantity), ranges with hyphen, en dash and em dash characters, "to", "or" (configurable), leading "of" strip, "Ripe tomato x2", "juice of 3 lemons" (`trailingQuantityContext`), group headers (line starts with "For " or ends with ":"), `decimalSeparator: ','`, `leadingQuantityPrefixes` (e.g. "about").
- Units: `tablespoon` alternates include `T`, `Tbsp`, `tbsp.`; `teaspoon` alternates include `t`, `tsp.`; `large`, `pinch`, `clove`, `can` are units. Hence `'2 large eggs'` yields unit `large` unless `ignoreUOMs: ['large']`.
- `description` is everything after the unit: "unsalted butter, divided", "beef, cut into 1 1/2-inch cubes". No item/notes split.
- `convertUnit(value, from, to, {fromSystem, toSystem})` with `'us' | 'imperial' | 'metric'`; returns `null` across mass/volume.
- `descriptionMeasurements` can report measurements inside the description (useful for detecting "(14 oz)" package sizes). Caveat from README: `C` is a cup abbreviation, so "bake at 175 C" reads as 175 cups.
- `round` defaults to 3 decimals.

**recipe-ingredient-parser-v3** (MIT, last publish 2025-02, ~400/week): returns `{quantity, unit, ingredient, minQty, maxQty}` and has a `combine()` that only merges identical ingredient + unit. English/Italian. Less maintained; not recommended. [README](https://github.com/suprmat95/recipe-parser). The `ingredient-parser` npm package (2016, v0.0.2) is abandoned.

**KitchenOwl** does not store quantity/unit at all: an item has a `name` and a free-text `description`, and the description strings are merged with a small Lark grammar that understands `x` counts, SI weights and SI volumes ([backend/app/util/description_merger.py](https://github.com/TomBursch/kitchenowl/blob/main/backend/app/util/description_merger.py)). Simple and robust, but it cannot merge "1 cup" + "2 tbsp".

### 1.2 Recommendation for a TS client app

Pick: **rule-based pipeline in plain TS, with `numeric-quantity` for numbers and either `parse-ingredient` as the amount/unit stage or a vendored equivalent, plus a CartCraft post-processor.** Reasons: runs offline, tiny, deterministic and testable; ML models are not portable to a PWA; LLM is optional by product decision.

Suggested output shape (inspired by ingredient-parser's dataclasses):

```ts
interface ParsedLine {
  raw: string;                 // never mutated
  qty: number | null;          // unrounded; null = no quantity ("to taste")
  qtyMax: number | null;       // range upper bound
  unit: UnitId | null;         // canonical id: 'tsp','tbsp','cup','g','oz','fl_oz','clove','can','pinch',...
  item: string;                // display name, e.g. "yellow onion"
  itemKey: string;             // normalized singular key for merging, e.g. "yellow onion"
  notes: string;               // prep/comment, e.g. "diced"
  size?: string;               // "large", "medium"
  packageSize?: { qty: number; unit: UnitId }; // "(14 oz)" in "1 (14 oz) can"
  alternatives?: string[];     // "or broth"
  flags: { approximate?: boolean; toTaste?: boolean; optional?: boolean; header?: boolean };
  confidence: 'ok' | 'review'; // drives the review UI
}
```

Post-processor steps after amount/unit extraction:
1. Package size: `qty (N unit) container` -> `packageSize`, unit = container (can, package, jar, box, bag, bottle, stick).
2. Size words (`SIZES` list) at the start of the description -> `size`, not unit.
3. Notes: split at the first top-level comma or semicolon; trailing parenthetical -> notes unless it starts with "or " (alternative).
4. Alternatives: " or " between two noun phrases with no quantity on the right -> `alternatives` (keep first as the item). "1 or 2" between numbers is a range, already consumed.
5. "to taste", "as needed", "for serving", "optional", "for garnish" -> flags + notes, `qty = null`.
6. "a"/"an"/"one" before a unit -> qty 1 ("a pinch of salt").
7. Item normalization for `itemKey`: lowercase, strip leading "of", strip trailing `*`, singularize the head noun via an exception-aware singularizer (dictionary first, then rules; `pluralize` npm is MIT but needs food exceptions).
8. Confidence `review` when: no item, unit unknown but looks like a word before the item, more than one number left in notes, leftover text from a range/alternative.

### 1.3 Known failure modes (seen in source or documented)

- Glued ranges "2-3 cloves" in the Tandoor/Mealie brute path: the unit starts with "-", so the whole token becomes a note ([Tandoor parse_amount](https://github.com/TandoorRecipes/recipes/blob/develop/cookbook/helper/ingredient_parser.py)).
- "salt, pepper" -> item "salt", note "pepper" (first comma rule). Needs an "X and/or Y to taste" special case or review flag.
- Ambiguous units as words: "1 tsp ground cloves", "2 bay leaves", "1 cup gram flour", "glass noodles", "pound cake" (ingredient-parser `AMBIGUOUS_UNITS`).
- `large`/`medium` parsed as unit (parse-ingredient default).
- "C" meaning Celsius inside notes; "T" vs "t" when text is upper-cased by a site ("1 T" is tbsp, "1 TSP" is tsp; all-caps "1 T SALT" is ambiguous, flag for review).
- Unicode fraction glued to an integer "1½" turning into "11/2" if replaced without a space (Mealie and ingredient-parser both guard this).
- `1/0` and negative quantities: parse-ingredient returns `null` quantity and keeps the description; a "-" bullet is not a minus.
- Decimal comma "1,5 kg" vs thousands "1,500 g": KitchenOwl's rule converts `\d+,\d{1,2}(?!\d)` to a decimal and leaves "1,000" alone.
- Footnote asterisks "flour*" (Mealie `remove_footnote_markers`).
- Second measurement in the same line "1 cup (240 ml) milk", "1 lb 2 oz cheese", "1 tablespoon lemon juice, plus 2 teaspoons zest".
- Rounded quantities drifting (0.333 x 3 = 0.999).
- Prepared vs raw: "1 cup chopped nuts" vs "1 cup nuts, chopped" (ingredient-parser `PREPARED_INGREDIENT`); for shopping both mean "nuts", so it only matters for notes.

---

## 2. Unit conversion, merging and scaling

### 2.1 How the apps merge

**Mealie** ([household_services/shopping_lists.py](https://github.com/mealie-recipes/mealie/blob/mealie-next/mealie/services/household_services/shopping_lists.py), `can_merge` ~line 47, `merge_items` ~line 75):
- Never merges checked items.
- Requires `food_id` equality. Items without a food merge only if their notes are identical.
- If unit ids differ, both units must carry a `standard_unit` (pint unit name) and be convertible; otherwise no merge (separate lines).
- Quantities are combined with pint after defining each custom unit as `standard_quantity * standard_unit`; result is expressed in the bigger of the two units, or the smaller if the total is < 1 ([unit_utils.py `merge_quantity_and_unit`](https://github.com/mealie-recipes/mealie/blob/mealie-next/mealie/services/parser_services/parser_utils/unit_utils.py)).
- `_resolve_ounce`: when "ounce" meets a volume, it is reinterpreted as fluid ounce.
- Notes are merged as a de-duplicated `" | "`-joined set; recipe references keep a per-recipe `recipe_scale` that is summed when the same recipe is added twice.
- Food matching uses name, plural name and aliases, normalized, with a fuzzy threshold (80 in the shopping list service, 85 default in the matcher) ([parser_services/_base.py](https://github.com/mealie-recipes/mealie/blob/mealie-next/mealie/services/parser_services/_base.py)). Fuzzy food matching is a merge risk for near-names.

**Tandoor**: the backend creates one `ShoppingListEntry` per ingredient with `amount = ingredient.amount * servings / recipe_servings` ([shopping_helper.py](https://github.com/TandoorRecipes/recipes/blob/develop/cookbook/helper/shopping_helper.py)). Merging is a *display* concern: the store groups entries by category then by food id ([vue3/src/stores/ShoppingStore.ts](https://github.com/TandoorRecipes/recipes/blob/develop/vue3/src/stores/ShoppingStore.ts)), and each food row sums entries per unit id, showing several amounts side by side when units differ ([ShoppingLineItem.vue `amounts`](https://github.com/TandoorRecipes/recipes/blob/develop/vue3/src/components/display/ShoppingLineItem.vue)). Conversions exist ([unit_conversion_helper.py](https://github.com/TandoorRecipes/recipes/blob/develop/cookbook/helper/unit_conversion_helper.py): fixed table for g/kg/oz/lb and ml/l/US and imperial fl oz, pint, quart, gallon, tbsp, tsp, cup, plus user-defined per-food conversions explored via BFS) but are used for properties/nutrition, not for collapsing list rows. Foods flagged `ignore_shopping` are never added (pantry analog) and "on hand" foods can be auto-excluded.

**KitchenOwl**: item name is the identity; descriptions are merged by grammar: counts (`x` or bare numbers) add, SI weights normalize through grams (auto mg/kg), SI volumes through mL (auto L), any other "unit" text is appended as a separate comma part ([description_merger.py](https://github.com/TomBursch/kitchenowl/blob/main/backend/app/util/description_merger.py)). Result looks like "500g, 2 cans".

**Grocy**: shopping list rows are keyed by `product_id`; adding a recipe adds `missing_amount - amount_on_shopping_list` to the existing row's amount in the product's purchase unit, converting via product-specific `quantity_unit_conversions` (from_qu, to_qu, factor, nullable product_id for defaults) and falling back to the recipe's unit when no conversion exists ([services/RecipesService.php `AddNotFulfilledProductsToShoppingList`](https://github.com/grocy/grocy/blob/master/services/RecipesService.php), [migrations/0082.sql](https://github.com/grocy/grocy/blob/master/migrations/0082.sql)). Grocy is stock-aware (only missing amounts are bought), which is a heavier model than CartCraft needs.

**AnyList** (closed source, help docs): "Similar ingredients are combined into a single list item which shows the total quantity needed", and the item detail lists each recipe's contribution ([add recipe ingredients to list](https://help.anylist.com/articles/add-recipe-ingredients-to-list/)).

### 2.2 Item identity and normalization for CartCraft

- Key = canonical item from the dictionary (after alias lookup), else the normalized singular head phrase. Example aliases: "eggs" -> "egg", "large eggs" -> "egg" with size "large", "scallions"/"green onions" -> "green onion", "cilantro"/"fresh coriander" -> "cilantro". Keep regional synonyms as aliases, not as fuzzy matches.
- Variety words are part of identity: "red onion" != "onion", "brown sugar" != "sugar", "garlic powder" != "garlic", "unsalted butter" vs "butter" is a product decision (suggest: merge; the dictionary can alias "unsalted butter" -> "butter" and keep "unsalted" in notes).
- Prep words are not identity: "onion, diced" and "chopped onion" -> "onion" (strip leading prep adjectives from a list: chopped, diced, minced, sliced, grated, shredded, softened, melted, room-temperature, fresh only when the dictionary says so).
- Singularization exceptions to hardcode: hummus, couscous, asparagus, molasses, swiss chard, brussels sprouts (keep plural form as canonical), leaves -> leaf only for "bay leaves", tomatoes -> tomato, potatoes -> potato, berries -> berry, chilies/chillies -> chili, anchovies -> anchovy, loaves -> loaf, "oats" stays "oats", "grits" stays.
- Use stored `plural` per dictionary entry for display, like Mealie/Tandoor `plural_name`.

### 2.3 Merge algorithm (fits the settled decisions)

1. Group lines by `itemKey`.
2. Within a group, bucket by dimension: `mass` (g), `volume` (mL), `count` (no unit, "each", size words), and one bucket per non-convertible unit (clove, can of 14 oz, bunch, pinch, sprig, slice, stick...). Package units bucket by `unit + packageSize`.
3. Sum each bucket in base units with unrounded numbers; ranges sum min and max separately.
4. Render buckets joined with " + ": "Garlic: 2 cloves + 1 tbsp", "Flour: 1 cup + 200 g". Order buckets by contribution or by fixed order (count, mass, volume, other).
5. Lines with `toTaste` / no quantity contribute nothing numeric; if the group has no numeric bucket, render just the item ("Salt").
6. Keep per-recipe contributions for an expandable detail (AnyList, Mealie recipe references).

### 2.4 Scaling gotchas

- Factor = target servings / base servings, per recipe (Tandoor `_servings_factor`).
- Scale only `qty`/`qtyMax`, never numbers inside notes or package sizes. AnyList: "Only the Quantity Field is Scaled" and "Only the First Value is Scaled", noting that later values usually refer to package or can size ([Scaling Recipes](https://help.anylist.com/articles/scale-recipe/)).
- Non-linear ingredients: AnyList warns that doubling spices may make the dish much spicier. For a shopping list the impact is small because salt, spices, leaveners are mostly pantry staples. Rule: lines with `pinch`, `dash`, `to taste`, `as needed` do not scale; spices/leaveners scale but go to "Check pantry".
- Counts: for shopping, ceil count-like units (egg, onion, lemon, can, package, stick, bunch, clove of garlic is rounded up to whole cloves). Show exact in the recipe view, ceiled on the list: "Eggs: 2 (1.5 needed)" or just "2". Half-items (0.5 onion) are plausible to ceil to 1.
- Very small scaled amounts (1/16 tsp) should display as "pinch" or "1/8 tsp" rather than 0.06.

### 2.5 Display formatting

- Use `format-quantity` (MIT) for "1 1/2" / "1½" output; it supports sixteenths, vulgar fractions, fraction slash, custom separators, and returns "" for 0 ([README](https://github.com/jakeboone02/format-quantity/blob/main/README.md)).
- Before formatting, snap US volume amounts to the nearest of {1/8, 1/4, 1/3, 1/2, 2/3, 3/4} within a tolerance (for example 5%), else show one decimal. Thirds matter: cups and teaspoons are commonly in thirds.
- Unit ladder for US volume: tsp -> tbsp (3 tsp) -> cup (16 tbsp); choose the largest unit with qty >= 1, but prefer "3 tbsp" over "3/16 cup" (allow 1/4 cup and above in cups). Mass: oz -> lb at >= 16 oz (or keep oz under 2 lb).
- Metric: g under 1000 rounded to 5 g above 100 g, kg above 1000 g with one decimal; mL / L similarly. KitchenOwl auto-promotes to kg/L only when the result is a whole number, which avoids "1.25 kg" noise.
- Pluralize the unit and item for qty != 1 using stored plurals (Tandoor's `pluralString` in ShoppingLineItem.vue).

### 2.6 Imperial vs metric pitfalls

- US cup = 236.6 mL (NIST lists cup 0.24 L, tablespoon 14.79 mL, teaspoon 4.93 mL, fl oz 29.57 mL; oz mass 28.35 g, lb 0.45 kg) ([NIST approximate conversions](https://www.nist.gov/pml/owm/approximate-conversions-us-customary-measures-metric)). US nutrition labeling uses 1 cup = 240 mL and 1 tbsp = 15 mL ([21 CFR 101.9(b)(5)](https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-101/subpart-A/section-101.9)).
- Other systems: metric cup 250 mL (AU/NZ/CA usage), Australian tablespoon 20 mL, imperial pint 568 mL vs US 473 mL, imperial fl oz 28.41 mL vs US 29.57 mL, imperial cup half an imperial pint. ingredient-parser models these as `imperial_cup`, `metric_tablespoon`, `aus_tablespoon` per `volumetric_units_system` ([en/_utils.py](https://github.com/strangetom/ingredient-parser/blob/master/ingredient_parser/en/_utils.py)); pint defines `imperial_cup = imperial_pint / 2` ([pint default_en.txt](https://github.com/hgrecco/pint/blob/master/pint/default_en.txt)); Tandoor's table has separate `us_cup`, `imperial_tbsp`, `imperial_tsp` ([unit_conversion_helper.py](https://github.com/TandoorRecipes/recipes/blob/develop/cookbook/helper/unit_conversion_helper.py)); parse-ingredient's `convertUnit` takes `fromSystem`/`toSystem`.
- Differences are small for cup/tbsp (about 5%) except the Australian tablespoon (33%), so default to US and treat it as acceptable for shopping.
- `oz` vs `fl oz`: "8 oz cream cheese" is mass, "8 oz milk" is probably fluid. Mealie guesses fluid when merging with a volume (`_resolve_ounce`). With no density table, CartCraft should keep `oz` as mass and render a combined line when it meets a volume ("Milk: 8 oz + 1 cup").
- "pint"/"quart" of berries/tomatoes are dry measures sold as containers; treat "pint" next to produce as a package unit (do not convert to mL).
- Converting volume <-> mass (cup of flour to grams) requires density; excluded by product decision. Never attempt it silently.

---

## 3. Aisle categorization

### 3.1 How others model it

- **Mealie**: Food -> `label_id` (a "multi-purpose label"); shopping list items inherit the food's label, or fall back to fuzzy-matching the item's display text against foods (`find_matching_label`, [shopping_lists.py](https://github.com/mealie-recipes/mealie/blob/mealie-next/mealie/services/household_services/shopping_lists.py)). Each shopping list has `label_settings` with a `position` per label, i.e. aisle order per list ([schema/household/group_shopping_list.py](https://github.com/mealie-recipes/mealie/blob/mealie-next/mealie/schema/household/group_shopping_list.py)). Seed foods (en-US) are 580 foods in 20 groups: Produce, Grains, Meat, Meat Products, Seafood, Dairy Products, Baked Goods, Canned Goods, Frozen Foods, Condiments, Spices, Oils, Baking, Sweets, Snacks, Beverages, Alcohol, Health Foods, Household, Other ([seed foods en-US.json](https://github.com/mealie-recipes/mealie/blob/mealie-next/mealie/repos/seed/resources/foods/locales/en-US.json)).
- **Tandoor**: `Food.supermarket_category` -> `SupermarketCategory`; a `Supermarket` orders categories through `SupermarketCategoryRelation.order`, so one category set can be ordered differently per store; categories are inherited down the food tree; foods have `ignore_shopping` ([cookbook/models.py](https://github.com/TandoorRecipes/recipes/blob/develop/cookbook/models.py) ~line 642). The UI can recategorize a food from the list and batch-update it (ShoppingStore.ts).
- **KitchenOwl**: `Category` with `ordering`; items have a category and a learned `ordering` computed from the order in which items get checked off across shopping trips (decaying cost matrix + topological sort, [jobs/item_ordering.py](https://github.com/TomBursch/kitchenowl/blob/main/backend/app/jobs/item_ordering.py)). Default categories (en): Baked goods, Preserved goods, Dairy, Drinks, Freezer, Fruits and vegetables, Pasta and grains, Hygiene, Refrigerated, Snacks; 655 default items ([templates/l10n/en.json](https://github.com/TomBursch/kitchenowl/blob/main/backend/templates/l10n/en.json)).
- **Grocy**: `products.product_group_id` -> `product_groups` ([migrations/0037.sql](https://github.com/grocy/grocy/blob/master/migrations/0037.sql)) and per-product default `shopping_location_id` -> `shopping_locations` (stores) ([migrations/0099.sql](https://github.com/grocy/grocy/blob/master/migrations/0099.sql)).
- **AnyList**: items carry a category per list; new items go to a configurable default category; items remember the category last assigned; "category sets" let one list have per-store category sets that mirror aisle layout ([Category Sets](https://help.anylist.com/articles/category-sets/), [default category](https://help.anylist.com/articles/default-category/), [change category](https://help.anylist.com/articles/change-category/)).

Pattern for CartCraft (matches the settled decision): `categoryFor(itemKey)` = personal dictionary (user correction) -> built-in dictionary (exact key, then aliases, then head noun such as "onion" in "yellow onion") -> LLM fallback (cached into the personal dictionary as "auto", user-overridable) -> "Other". Category order is a user-editable list (one store is enough for v1; Tandoor/AnyList show per-store order is the natural extension).

### 3.2 Starter dictionary data and licenses

| Source | Size | License | Use for CartCraft |
|---|---|---|---|
| [Open Tandoor Data](https://github.com/TandoorRecipes/open-tandoor-data) `data/food/base/data.json`, `data/category/base/data.json` | 391 foods, 22 store categories (Produce, Dairy, Cheese, Meat, Fish and Seafood, Bakery, Baking, Herbs and Spices, Condiments and Sauces, Oil and Vinegar, Canned, Frozen, Dry Goods, Noodles, Cereal, Deli, Sweets, Sweet Spreads, Savory Spreads, Coffee and Tea, Juices, Alcohol); each food has `name`, `plural_name`, `store_category`, FDC id | Schema ODbL 1.0, contents DbCL 1.0 ([README License](https://github.com/TandoorRecipes/open-tandoor-data/blob/main/README.md)) | Best candidate. Requires attribution; a derived database that is publicly used must be offered under ODbL (share-alike). Keep it as a separate JSON asset with a notice. |
| Mealie seed foods | 580 foods / 20 groups | AGPL-3.0 (repo license) | Do not copy. Reference only. |
| KitchenOwl default items | 655 items / 10 categories | AGPL-3.0 (repo license) | Do not copy. |
| [USDA FoodData Central](https://fdc.nal.usda.gov/api-guide) | large | CC0 1.0 ("public domain ... not copyrighted") | Food names and food categories, but categories are nutritional (e.g. "Vegetables and Vegetable Products"), not aisles. Usable for names/aliases. |
| [Open Food Facts](https://world.openfoodfacts.org/terms-of-use) | very large, branded products | ODbL + DbCL | Overkill; branded products, share-alike. |

Recommendation: hand-write a ~300 to 500 entry CartCraft dictionary (own work, so no license burden), optionally seeded/checked against Open Tandoor Data with attribution. Include aliases and plural forms per entry.

---

## 4. schema.org Recipe extraction

### 4.1 Spec facts

- `recipeIngredient`: ItemList, PropertyValue, or Text; supersedes `ingredients` ([schema.org/Recipe](https://schema.org/Recipe)). In practice it is an array of strings; recipe-scrapers also handles `PropertyValue` objects (`value unitText name`).
- `recipeYield`: QuantitativeValue or Text (schema.org). Google says: "Specify the number of servings produced from this recipe with just a number", and you "may include additional yields" for other units, which is why arrays like `["4", "4 servings"]` or `["6", "24 cookies"]` exist ([Google Recipe structured data](https://developers.google.com/search/docs/appearance/structured-data/recipe)).
- `recipeInstructions`: CreativeWork, ItemList, or Text; "an ordered list with HowToStep and/or HowToSection items" (schema.org). Not needed for a shopping list, but keep for display.
- Ingredient section headings ("For the glaze") are NOT represented in `recipeIngredient`; recipe-scrapers derives `ingredient_groups()` from site HTML, not JSON-LD ([_abstract.py](https://github.com/hhursev/recipe-scrapers/blob/main/recipe_scrapers/_abstract.py)). Some sites put headings as ingredient strings; detect them (parse-ingredient `isGroupHeader`).

### 4.2 recipe-scrapers (Python, MIT) behaviour

[_schemaorg.py](https://github.com/hhursev/recipe-scrapers/blob/main/recipe_scrapers/_schemaorg.py):
- Uses `extruct` for `json-ld` and `microdata` (`uniform=True`), so microdata is a built-in fallback.
- `_contains_schematype` handles `@type` as string or array (`["Recipe", "NewsArticle"]`), case-insensitive substring match.
- `_find_entity` checks the item itself, then each `@graph` node (also nested lists in `@graph`).
- Also accepts a `WebPage` whose `mainEntity` is the Recipe.
- Skips items whose `@context` does not contain "schema.org".
- Multiple Recipe objects: takes the first one, then merges in properties from later objects only when they share the same `@id` or `name` (same recipe in two formats). It does not pick "the biggest" recipe.
- `ingredients()`: `recipeIngredient` or legacy `ingredients`; flattens nested lists; wraps a single string; drops `None`; normalizes each string.
- `normalize_string` ([_utils.py](https://github.com/hhursev/recipe-scrapers/blob/main/recipe_scrapers/_utils.py) ~line 350): `html.unescape` in a loop until stable (handles double-encoded `&amp;#039;`), strips tags, replaces `\xa0`, zero-width space, newlines, tabs.
- `get_yields` (~line 254): for a list, picks the first element that contains a yield unit word; handles "4 to 6" / "4-6" by taking text after the range; returns strings like "4 servings", "24 cookies", "2 dozen".
- Instructions: handles `HowToStep` (dedupes `name` vs `text`), `HowToSection` (adds section name, then its `itemListElement`, which may be a dict instead of a list on NYT), and plain strings.
- Since the generic path is `scrape_html(html, org_url, supported_only=False)`, Mealie and KitchenOwl both call it that way; `online` downloading and `wild_mode` are deprecated (fetch the HTML yourself) ([__init__.py `scrape_html`](https://github.com/hhursev/recipe-scrapers/blob/main/recipe_scrapers/__init__.py)).

### 4.3 Mealie and Tandoor around the scraper

- Mealie strategy order: recipe-scrapers package -> video transcription -> OpenAI -> OpenGraph-only ([recipe_scraper.py](https://github.com/mealie-recipes/mealie/blob/mealie-next/mealie/services/scraper/recipe_scraper.py)). The package result is accepted only if it has ingredients or instructions ([scraper_strategies.py](https://github.com/mealie-recipes/mealie/blob/mealie-next/mealie/services/scraper/scraper_strategies.py) ~line 302).
- Mealie `clean_yield` splits each yield entry into "servings" (when the text contains a translated "serves/servings/yield" word) vs "yield quantity + text" ([cleaner.py](https://github.com/mealie-recipes/mealie/blob/mealie-next/mealie/services/scraper/cleaner.py) ~line 436). `clean_ingredients` accepts list, string (split by lines), or dicts; `clean_string` unescapes HTML and strips tags.
- Tandoor `parse_servings`: string -> first integer, list -> first integer of element 0, fallback 1; `parse_servings_text` keeps the leftover text ([recipe_url_import.py](https://github.com/TandoorRecipes/recipes/blob/develop/cookbook/helper/recipe_url_import.py) ~line 385). The "fallback 1" makes scaling wrong for recipes without a yield; prefer "unknown, ask user".
- KitchenOwl parses yields with `re.search(r"\d*", ...)` on recipe-scrapers' normalized yield string; that regex matches an empty string whenever the text does not start with a digit (e.g. "Serves 4") ([recipe_scraping.py](https://github.com/TomBursch/kitchenowl/blob/main/backend/app/service/recipe_scraping.py)). Lesson: test "Serves 4", "Makes 12", "4-6".
- Fetching: Mealie caps time (15 s), caps body size, blocks private/loopback/link-local/CGNAT IPs (SSRF), rotates browser TLS impersonations (curl-cffi) to get past Cloudflare JA3/JA4 fingerprinting, and can route through FlareSolverr ([mealie/pkgs/safehttp](https://github.com/mealie-recipes/mealie/tree/mealie-next/mealie/pkgs/safehttp), [scraper/fetch.py](https://github.com/mealie-recipes/mealie/blob/mealie-next/mealie/services/scraper/fetch.py)). KitchenOwl sends a browser-like UA containing "recipe-scrapers" "to circumvent anti-scraping measures that block requests with the default user agent".

### 4.4 Gotchas for the Cloudflare Pages Function

- Bot blocking: some sites return 403 or a challenge page to non-browser clients. A Worker cannot do TLS impersonation or solve challenges (and must not). Send a normal UA and `Accept: text/html`, detect challenge pages (403/503 with `cf-mitigated` or "Just a moment..." title), and return a clear "site blocked import, paste the ingredients instead" result. The paste-text path is the real fallback; LLM-from-URL also cannot read a page that was not fetched.
- Lazy-loaded / client-rendered pages: JSON-LD is usually server-rendered for SEO, but if absent, try microdata (`itemtype="http://schema.org/Recipe"`, `itemprop="recipeIngredient"`), then send cleaned visible text to the LLM.
- Use `HTMLRewriter` to stream-extract only `script[type="application/ld+json"]` contents instead of loading a DOM parser ([HTMLRewriter docs](https://developers.cloudflare.com/workers/runtime-apis/html-rewriter/), [Pages Functions](https://developers.cloudflare.com/pages/functions/)). Alternatively the TS port `recipe-scrapers` (npm, MIT, peer deps cheerio + zod) implements Schema.org + OpenGraph + site-specific extraction ([recipe-scrapers/recipe-scrapers](https://github.com/recipe-scrapers/recipe-scrapers)).
- Invalid JSON in JSON-LD blocks is common (trailing commas, raw newlines inside strings, HTML comments, multiple objects concatenated, `<!--` wrappers). Try `JSON.parse`, then a tolerant cleanup pass, and skip the block on failure.
- Multiple Recipe objects (round-ups, "related recipes" widgets): prefer the one whose `url`/`@id` matches the requested URL or `mainEntityOfPage`, else the first; surface "this page has N recipes" if needed.
- Limit response size and time, follow a bounded number of redirects, only allow `http(s)` URLs, and return only the extracted fields (name, ingredients, yield, image, source URL) to the client.

---

## 5. LLM-assisted parsing

### 5.1 Mealie's OpenAI ingredient parser

- Prompt file [prompts/recipes/parse-recipe-ingredients.txt](https://github.com/mealie-recipes/mealie/blob/mealie-next/mealie/services/openai/prompts/recipes/parse-recipe-ingredients.txt). Key rules: return the same number of ingredients in the same order; "If uncertain about quantity, unit, or food, put the entire string in the note field"; do not translate; parenthetical text is a note unless it names an alternative; alternatives go to `substitutes` and "never suggest your own"; ranges use the lower number; "All text must appear somewhere"; never split one input line into several ingredients ("1 tablespoon fresh lemon juice, plus 2 teaspoons zest" stays one).
- Schema [schema/openai/recipe_ingredient.py](https://github.com/mealie-recipes/mealie/blob/mealie-next/mealie/schema/openai/recipe_ingredient.py): `{ingredients: [{quantity: float|null, unit: str|null, food: str|null, note: str|null, substitutes: str[]}]}` with field descriptions ("Convert fractions to decimals").
- Known units from the user's database are injected into the system prompt as reference data.
- Input is the JSON-encoded array of lines; the call uses `response_format=<pydantic model>` (OpenAI structured output), checks `finish_reason` for `length` / `content_filter`, strips NULs and markdown code fences, then validates with pydantic ([services/openai/openai.py](https://github.com/mealie-recipes/mealie/blob/mealie-next/mealie/services/openai/openai.py), [schema/openai/_base.py](https://github.com/mealie-recipes/mealie/blob/mealie-next/mealie/schema/openai/_base.py)).
- Hard check: if the output count differs from input count, raise ([openai/parser.py](https://github.com/mealie-recipes/mealie/blob/mealie-next/mealie/services/parser_services/openai/parser.py) `parse`).
- Confidence: quantity confidence is 1 only if the LLM quantity equals the regex-extracted quantity from the original text, else 0; note confidence = share of note words that occur in the original text (catches invented words); overall = rapidfuzz token-sort ratio between original and re-rendered ingredient. Low confidence surfaces in the review UI.
- URL/HTML import with LLM is two-stage: first "transcribe" the source into faithful plain text with a `contains_recipe` flag and "Do not create, infer, or make up any information" ([compile-source.txt](https://github.com/mealie-recipes/mealie/blob/mealie-next/mealie/services/openai/prompts/recipes/compile-source.txt)), then structure it.

### 5.2 KitchenOwl's LLM parser (a weaker pattern, useful as contrast)

[ingredient_parsing.py](https://github.com/TomBursch/kitchenowl/blob/main/backend/app/service/ingredient_parsing.py): prompt asks for `[{"name","description"}]` "Return only JSON and nothing else", `response_format` is commented out, output is `json.loads`-ed directly; on length mismatch returns `None` and the caller falls back to the NLP parser; any exception also falls back. Good: fallback. Bad: no schema validation, no quantity check, translation instructions in the same prompt.

### 5.3 Provider constraints (DeepSeek default)

DeepSeek JSON Output requires `response_format: {type: 'json_object'}`, the word "json" plus an example in the prompt, a sensible `max_tokens` to avoid truncation, and warns the API "may occasionally return empty content" ([DeepSeek JSON Output](https://api-docs.deepseek.com/guides/json_mode)). It is JSON mode, not schema-enforced output, unlike OpenAI Structured Outputs ([OpenAI structured outputs](https://platform.openai.com/docs/guides/structured-outputs)). Since the endpoint is user-configurable (OpenAI-compatible), assume only JSON mode and validate everything client-side.

### 5.4 Best practices for CartCraft

1. Deterministic parse first; send only lines with `confidence: 'review'` (or the whole messy paste) to the LLM.
2. Request JSON with a top-level object `{ "lines": [...] }` (JSON mode returns objects more reliably than bare arrays), include one example, and send input as a JSON array with explicit indices: `[{ "i": 0, "text": "..." }]`. Require the model to echo `i`.
3. Validate with zod/valibot (both MIT): exact length, every `i` present once, types, `qty >= 0`, `unit` in an allowlist or null, strings length-capped.
4. Quantity guard: for each line, if the deterministic parser found a number, the LLM qty must equal it (or equal its range min/max); if the raw text has no digits/fraction/number word, the LLM qty must be null. On violation keep the deterministic qty and mark for review. Never accept a quantity the text does not contain ("to taste" must not become "1 tsp").
5. Text guard: every token of `item` and `notes` should appear in the raw line (Mealie's note-word check), except a small allowlist of normalizations (singular forms, unit expansions).
6. Never let the LLM merge, scale, convert or categorize-and-sum; it returns per-line structure only. Merging and math stay in TS.
7. Handle failures: empty content, invalid JSON, truncated output (`finish_reason == 'length'`), timeouts, HTTP 429. Retry once with a smaller batch, then fall back to the deterministic result. Batch size around 20 to 40 lines keeps cheap models accurate and avoids truncation.
8. Cache LLM results by hash of the raw line plus prompt version, so re-imports are free and deterministic.
9. Aisle fallback: send only unknown item keys, ask for one category id from the enumerated list (closed set), validate membership, store as "auto" in the personal dictionary, let the user correct it.
10. For "swaps/tips", output is display-only text; never write it back into the ingredient list without user review.

---

## Gotchas checklist (input -> expected output)

Parsing (`qty`, `qtyMax`, `unit`, `item`, `notes`, flags):

- `1 1/2 cups flour` -> 1.5, cup, "flour"
- `1½ cups flour` -> 1.5, cup, "flour" (not 11/2)
- `½ tsp salt` -> 0.5, tsp, "salt"
- `1 and 1/2 cups milk` -> 1.5, cup, "milk"
- `2-3 cloves garlic, minced` -> 2, max 3, clove, "garlic", notes "minced"
- `2 to 3 tbsp olive oil` -> 2, max 3, tbsp, "olive oil"
- `½-¾ cup sugar` -> 0.5, max 0.75, cup, "sugar"
- `1 or 2 jalapeños` -> 1, max 2, no unit, "jalapeño"
- `1 T sugar` -> 1, tbsp; `1 t sugar` -> 1, tsp; `1 Tbsp. butter` -> 1, tbsp
- `1 (14 oz) can diced tomatoes` -> 1, can, packageSize 14 oz, "diced tomatoes"
- `2 14-ounce cans coconut milk` -> 2, can, packageSize 14 oz, "coconut milk"
- `1 lb 2 oz cheddar` -> 18 oz (mass), "cheddar"
- `1 cup (240 ml) milk` -> 1, cup, "milk", notes "240 ml"
- `2 large eggs` -> 2, no unit, size "large", "egg"
- `3 eggs` and `1 egg` -> itemKey "egg"
- `1 medium onion, diced` -> 1, size "medium", "onion", notes "diced"
- `1 red onion, thinly sliced` -> itemKey "red onion" (not "onion")
- `Salt, to taste` -> qty null, "salt", toTaste
- `salt and pepper to taste` -> two pantry items or one review line; never "salt" with note "pepper"
- `a pinch of salt` -> 1, pinch, "salt"
- `pinch of nutmeg` -> 1, pinch, "nutmeg"
- `1 cup chicken stock (or broth)` -> 1, cup, "chicken stock", alternatives ["broth"]
- `1 cup butter or margarine` -> item "butter", alternatives ["margarine"]
- `1 tablespoon lemon juice, plus 2 teaspoons zest` -> one line: 1 tbsp "lemon juice", notes "plus 2 teaspoons zest" (review)
- `about 2 cups spinach` -> 2, cup, approximate
- `1 tsp ground cloves` -> unit tsp, item "ground cloves" (cloves is not the unit)
- `2 bay leaves` -> 2, no unit, "bay leaf"
- `1 cup gram flour` -> unit cup, item "gram flour"
- `Juice of 2 lemons` -> 2, "lemon", notes "juice" (or item "lemon juice" by dictionary rule)
- `Ripe tomato x2` -> 2, "tomato"
- `For the sauce:` -> header, not an ingredient
- `flour*` -> "flour" (footnote marker dropped)
- `1,5 kg Mehl` with decimal comma setting -> 1.5 kg; `1,000 g flour` -> 1000 g
- `-2 cups sugar` (bullet) -> qty 2 after bullet stripping, never negative
- `Bake at 175 C` inside notes -> not a cup measurement
- `&frac12; cup cream` / `1/2&nbsp;cup cream` -> 0.5, cup, "cream"
- empty line, whitespace, or line > 512 chars -> skipped or flagged, never throws

Merging (target unit system in brackets):

- `1/3 cup sugar` x3 -> "Sugar: 1 cup" (no 0.999)
- `2 tbsp butter` + `1/4 cup butter` [US] -> "Butter: 6 tbsp" or "1/4 cup + 2 tbsp" (pick one rule, test it)
- `2 cloves garlic` + `1 tbsp minced garlic` -> "Garlic: 2 cloves + 1 tbsp"
- `1 cup flour` + `200 g flour` -> "Flour: 1 cup + 200 g"
- `8 oz cream cheese` + `4 oz cream cheese` -> "Cream cheese: 12 oz" [US] / "340 g" [metric]
- `8 oz milk` + `1 cup milk` -> "Milk: 8 oz + 1 cup" (no oz/fl oz guess)
- `1 (14 oz) can tomatoes` + `1 (28 oz) can tomatoes` -> "Tomatoes: 1 can (14 oz) + 1 can (28 oz)"
- `1 onion` + `1 red onion` -> two lines
- `3 eggs` + `2 large eggs` -> "Eggs: 5"
- `Salt, to taste` + `1 tsp salt` -> "Salt: 1 tsp" in Check pantry
- `500 g` + `750 g` [metric] -> "1.25 kg" or "1250 g" (pick and test)
- `2-3 cloves` + `1 clove` -> "3-4 cloves"
- checked/purchased items are not merged into (Mealie rule) if list state is kept across rebuilds

Scaling:

- base 4 -> target 6: `3 eggs` -> 4.5 -> list shows 5
- base 4 -> target 2: `1 (14 oz) can beans` -> 0.5 can -> list shows 1 can (14 oz)
- base 4 -> target 8: `a pinch of salt` -> still 1 pinch
- base 4 -> target 6: `1 cup milk` -> 1 1/2 cups
- base 4 -> target 3: `1 tsp vanilla` -> 3/4 tsp
- base 8 -> target 1: `1/4 tsp cayenne` -> 1/32 tsp -> display "pinch" or "1/8 tsp" (rule)
- notes numbers never scale: `1 lb beef, cut into 1-inch cubes` x2 -> 2 lb, notes unchanged

URL import:

- JSON-LD `@graph` with WebPage + Recipe -> Recipe found
- `"@type": ["Recipe", "NewsArticle"]` -> Recipe found
- WebPage with `mainEntity` Recipe -> Recipe found
- `recipeYield: "4"` -> servings 4; `"Serves 4-6"` -> 4 (text kept); `["4", "4 servings"]` -> 4; `["6", "24 cookies"]` -> servings 6, yield text "24 cookies"; `4` (number) -> 4; missing -> unknown, ask user
- `recipeIngredient` with `&amp;frac12;` (double-encoded) -> "½"
- `recipeIngredient: "1 cup flour\n2 eggs"` (single string) -> two lines
- nested arrays in `recipeIngredient` -> flattened
- two Recipe objects -> the one matching the URL, else first
- JSON-LD with trailing comma -> tolerant parse or skip block, then microdata
- 403 / Cloudflare challenge page -> "blocked" error, offer paste
- no structured data -> LLM fallback (if configured) else "paste ingredients"

---

## Anti-patterns to avoid

- **LLM emits markdown, regex parses it back** (original CartCraft). Use JSON mode + schema validation, or no LLM.
- **LLM does the merging/scaling/unit math.** It hallucinates totals; keep all arithmetic deterministic.
- **LLM output trusted without checks.** At minimum: same count, same order, quantity cross-check against the deterministic parse (Mealie), fallback on any failure (KitchenOwl).
- **Rounding quantities at parse time** (3-decimal defaults in numeric-quantity / parse-ingredient). Round only for display.
- **Fuzzy food matching for merge identity** (Mealie threshold 80 to 85). Merging "green onion" into "onion" or "sweet potato" into "potato" corrupts the list.
- **Collapsing incompatible units into one number** via guessed densities or oz/fl oz assumptions.
- **Scaling the package size** in "1 (14 oz) can" or numbers inside notes.
- **Defaulting missing servings to 1** (Tandoor `parse_servings` fallback); scaling a 6-serving recipe "to 4" from a fake base of 1 multiplies by 4.
- **Throwing away unparsed text.** Keep `raw` and put leftovers in notes.
- **Treating size words (`large`, `medium`) as units** or as part of item identity.
- **Splitting one source line into multiple list items** ("salt and pepper", "lemon juice plus zest") without user review.
- **Copying AGPL code or seed data** (Mealie, KitchenOwl, Tandoor) into an MIT/proprietary codebase.
- **Server-side scraping that impersonates browsers or solves challenges**; it is brittle and against many sites' terms. Offer paste instead.

---

## License notes (reuse candidates)

| Thing | License | Verdict |
|---|---|---|
| parse-ingredient, numeric-quantity, format-quantity (jakeboone02) | MIT | Safe to depend on; keep notices. |
| recipe-scrapers (Python, hhursev) | MIT | Logic can be ported with attribution. |
| recipe-scrapers (TS port, npm) | MIT | Safe; peer deps cheerio (MIT) and zod (MIT). |
| ingredient-parser-nlp (strangetom) | MIT | Constants/rules can be ported with attribution; training data comes from third-party recipe sites (do not ship). |
| NYT ingredient-phrase-tagger + 2015 CSV | Apache-2.0 (repo) | Fine as a dev-only test corpus; underlying text is NYT recipe content, do not bundle. |
| pluralize, zod, valibot | MIT | Safe. |
| Grocy | MIT | Ideas/code reusable with attribution. |
| Mealie | AGPL-3.0 | Read only; do not copy code, prompts or seed data. |
| KitchenOwl | AGPL-3.0 | Read only. |
| Tandoor | AGPL-3.0 + Commons Clause ([LICENSE.md](https://github.com/TandoorRecipes/recipes/blob/develop/LICENSE.md)) | Read only. |
| Open Tandoor Data | ODbL 1.0 (database) / DbCL 1.0 (contents) | Usable with attribution; derived database must remain ODbL if publicly used. |
| USDA FoodData Central | CC0 1.0 | Free to use (attribution requested). |
| Open Food Facts | ODbL + DbCL | Share-alike; probably unnecessary. |
| schema.org vocabulary | CC BY-SA 3.0 ([schema.org terms](https://schema.org/docs/terms.html)) | Only the vocabulary names are used; no concern. |

Note: npm package behaviours above come from READMEs and test fixtures read on 2026-10-01; I did not execute the packages. Verify the parse-ingredient cases in the checklist with a quick spike before committing to it.

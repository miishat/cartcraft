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

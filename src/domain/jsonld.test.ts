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

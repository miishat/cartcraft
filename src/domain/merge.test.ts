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
    expect(shown([recipe('A', ['8 oz milk']), recipe('B', ['1 cup milk'])])).toEqual({ milk: '1/2 lb + 1 cup' });
  });

  it('sums weights and converts per unit system', () => {
    const selections = [recipe('A', ['8 oz cream cheese']), recipe('B', ['4 oz cream cheese'])];
    expect(shown(selections)).toEqual({ 'cream cheese': '3/4 lb' });
    expect(shown(selections, 'metric')).toEqual({ 'cream cheese': '340 g' });
    expect(shown([recipe('A', ['500 g rice']), recipe('B', ['750 g rice'])], 'metric')).toEqual({ rice: '1.25 kg' });
  });

  it('keeps different package sizes apart', () => {
    expect(shown([recipe('A', ['1 (14 oz) can tomatoes']), recipe('B', ['1 (28 oz) can tomatoes'])]))
      .toEqual({ tomato: '1 can (14 oz) + 1 can (28 oz)' });
  });

  it('1/2 cup + 8 tbsp reads as 1 cup, not "1 cups"', () => {
    expect(shown([recipe('A', ['1/2 cup sugar']), recipe('B', ['8 tbsp sugar'])])).toEqual({ sugar: '1 cup' });
  });

  it('sorts deterministically with a locale-independent compare and itemKey tie-break', () => {
    const items = build([recipe('A', ['1 egg', '1 Egg Yolk', '1 apple']), recipe('B', ['1 Apple'])]);
    expect(items.map((i) => i.itemKey)).toEqual(['apple', 'egg', 'egg yolk']);
    const tied = build([{ title: 'T', baseServings: 1, targetServings: 1, ingredients: [
      { ...parseIngredientLine('1 zucchini', 'z1'), item: 'Same', itemKey: 'b-key' },
      { ...parseIngredientLine('1 zucchini', 'z2'), item: 'Same', itemKey: 'a-key' },
    ] }]);
    expect(tied.map((i) => i.itemKey)).toEqual(['a-key', 'b-key']);
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

import { describe, expect, it } from 'vitest';
import { parseIngredientLine } from './parse';

const parse = (raw: string) => parseIngredientLine(raw, 'id-1');

describe('parseIngredientLine: amounts', () => {
  it.each([
    ['1 1/2 cups flour', 1.5, 'cup', 'flour'],
    ['1½ cups flour', 1.5, 'cup', 'flour'],
    ['½ tsp salt', 0.5, 'tsp', 'salt'],
    ['1 and 1/2 cups milk', 1.5, 'cup', 'milk'],
    ['&frac12; cup cream', 0.5, 'cup', 'cream'],
    ['1/2&nbsp;cup cream', 0.5, 'cup', 'cream'],
    ['-2 cups sugar', 2, 'cup', 'sugar'],
    ['1,5 kg Mehl', 1.5, 'kg', 'Mehl'],
    ['1,000 g flour', 1000, 'g', 'flour'],
  ])('%s', (raw, min, unit, item) => {
    const line = parse(raw);
    expect(line.quantity).toEqual({ min });
    expect(line.unit).toBe(unit);
    expect(line.item).toBe(item);
  });

  it('keeps 1/3 unrounded', () => {
    expect(parse('1/3 cup sugar').quantity?.min).toBeCloseTo(1 / 3, 10);
  });

  it.each([
    ['2-3 cloves garlic, minced', { min: 2, max: 3 }, 'clove', 'garlic', 'minced'],
    ['2 to 3 tbsp olive oil', { min: 2, max: 3 }, 'tbsp', 'olive oil', ''],
    ['½-¾ cup sugar', { min: 0.5, max: 0.75 }, 'cup', 'sugar', ''],
  ])('range %s', (raw, quantity, unit, item, notes) => {
    const line = parse(raw);
    expect(line.quantity).toEqual(quantity);
    expect(line.unit).toBe(unit);
    expect(line.item).toBe(item);
    expect(line.notes).toBe(notes);
  });

  it('1 or 2 jalapeños is a range with no unit', () => {
    const line = parse('1 or 2 jalapeños');
    expect(line.quantity).toEqual({ min: 1, max: 2 });
    expect(line.unit).toBeUndefined();
    expect(line.itemKey).toBe('jalapeño');
  });

  it('about 2 cups spinach is approximate', () => {
    const line = parse('about 2 cups spinach');
    expect(line.quantity).toEqual({ min: 2 });
    expect(line.approximate).toBe(true);
    expect(line.item).toBe('spinach');
  });

  it('Ripe tomato x2', () => {
    const line = parse('Ripe tomato x2');
    expect(line.quantity).toEqual({ min: 2 });
    expect(line.itemKey).toBe('tomato');
  });

  it('Juice of 2 lemons', () => {
    const line = parse('Juice of 2 lemons');
    expect(line.quantity).toEqual({ min: 2 });
    expect(line.itemKey).toBe('lemon');
    expect(line.notes).toBe('juice');
  });
});

describe('parseIngredientLine: units', () => {
  it.each([
    ['1 T sugar', 'tbsp'],
    ['1 t sugar', 'tsp'],
    ['1 Tbsp. butter', 'tbsp'],
    ['8 fl oz milk', 'fl oz'],
    ['8 oz cream cheese', 'oz'],
  ])('%s -> %s', (raw, unit) => {
    expect(parse(raw).unit).toBe(unit);
  });

  it('1 tsp ground cloves: cloves is the item, not the unit', () => {
    const line = parse('1 tsp ground cloves');
    expect(line.unit).toBe('tsp');
    expect(line.item).toBe('ground cloves');
  });

  it('1 cup gram flour: gram is part of the item', () => {
    const line = parse('1 cup gram flour');
    expect(line.unit).toBe('cup');
    expect(line.item).toBe('gram flour');
  });

  it('1 lb 2 oz cheddar becomes 18 oz', () => {
    const line = parse('1 lb 2 oz cheddar');
    expect(line.quantity).toEqual({ min: 18 });
    expect(line.unit).toBe('oz');
    expect(line.item).toBe('cheddar');
  });

  it('1 cup (240 ml) milk keeps the conversion as a note', () => {
    const line = parse('1 cup (240 ml) milk');
    expect(line.unit).toBe('cup');
    expect(line.item).toBe('milk');
    expect(line.notes).toBe('240 ml');
  });

  it.each([
    ['a pinch of salt', 'salt'],
    ['pinch of nutmeg', 'nutmeg'],
  ])('%s is 1 pinch and not scalable', (raw, item) => {
    const line = parse(raw);
    expect(line.quantity).toEqual({ min: 1 });
    expect(line.unit).toBe('pinch');
    expect(line.item).toBe(item);
    expect(line.scalable).toBe(false);
  });
});

describe('parseIngredientLine: package sizes and size words', () => {
  it('1 (14 oz) can diced tomatoes', () => {
    const line = parse('1 (14 oz) can diced tomatoes');
    expect(line.quantity).toEqual({ min: 1 });
    expect(line.unit).toBe('can');
    expect(line.packageSize).toEqual({ quantity: 14, unit: 'oz' });
    expect(line.item).toBe('diced tomatoes');
  });

  it('2 14-ounce cans coconut milk', () => {
    const line = parse('2 14-ounce cans coconut milk');
    expect(line.quantity).toEqual({ min: 2 });
    expect(line.unit).toBe('can');
    expect(line.packageSize).toEqual({ quantity: 14, unit: 'oz' });
    expect(line.item).toBe('coconut milk');
  });

  it('2 large eggs: large is a size, not a unit', () => {
    const line = parse('2 large eggs');
    expect(line.quantity).toEqual({ min: 2 });
    expect(line.unit).toBeUndefined();
    expect(line.size).toBe('large');
    expect(line.itemKey).toBe('egg');
  });

  it('1 medium onion, diced', () => {
    const line = parse('1 medium onion, diced');
    expect(line.size).toBe('medium');
    expect(line.item).toBe('onion');
    expect(line.notes).toBe('diced');
  });
});

describe('parseIngredientLine: items, notes and flags', () => {
  it.each([
    ['3 eggs', 'egg'],
    ['1 egg', 'egg'],
    ['1 red onion, thinly sliced', 'red onion'],
    ['2 bay leaves', 'bay leaf'],
    ['flour*', 'flour'],
  ])('%s -> itemKey %s', (raw, key) => {
    expect(parse(raw).itemKey).toBe(key);
  });

  it('Salt, to taste has no quantity and is not scalable', () => {
    const line = parse('Salt, to taste');
    expect(line.quantity).toBeUndefined();
    expect(line.item).toBe('Salt');
    expect(line.notes).toBe('to taste');
    expect(line.scalable).toBe(false);
  });

  it('salt and pepper to taste is one line flagged for review', () => {
    const line = parse('salt and pepper to taste');
    expect(line.item).toBe('salt and pepper');
    expect(line.needsReview).toBe(true);
    expect(line.scalable).toBe(false);
  });

  it('1 cup chicken stock (or broth)', () => {
    const line = parse('1 cup chicken stock (or broth)');
    expect(line.item).toBe('chicken stock');
    expect(line.alternatives).toEqual(['broth']);
  });

  it('1 cup butter or margarine', () => {
    const line = parse('1 cup butter or margarine');
    expect(line.item).toBe('butter');
    expect(line.alternatives).toEqual(['margarine']);
  });

  it('plus clauses stay on one line and are flagged', () => {
    const line = parse('1 tablespoon lemon juice, plus 2 teaspoons zest');
    expect(line.quantity).toEqual({ min: 1 });
    expect(line.unit).toBe('tbsp');
    expect(line.item).toBe('lemon juice');
    expect(line.notes).toBe('plus 2 teaspoons zest');
    expect(line.needsReview).toBe(true);
  });

  it('For the sauce: is a header', () => {
    const line = parse('For the sauce:');
    expect(line.isHeader).toBe(true);
    expect(line.item).toBe('For the sauce');
  });

  it('a clean line is not flagged', () => {
    const line = parse('2 cups flour');
    expect(line.needsReview).toBe(false);
    expect(line.scalable).toBe(true);
  });

  it.each(['', '   ', 'x'.repeat(600)])('never throws on bad input (%#)', (raw) => {
    const line = parse(raw);
    expect(line.raw).toBe(raw);
    expect(line.needsReview).toBe(true);
  });
});

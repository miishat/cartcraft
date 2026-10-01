import type { Dimension, UnitId } from './types';

export interface UnitDef {
  id: UnitId;
  dimension: Dimension;
  /** Multiplier to the dimension's base unit: mL for volume, g for mass, 1 otherwise. */
  toBase: number;
  singular: string;
  plural: string;
  packaged?: boolean;
}

const DEFS: UnitDef[] = [
  { id: 'tsp', dimension: 'volume', toBase: 4.92892, singular: 'tsp', plural: 'tsp' },
  { id: 'tbsp', dimension: 'volume', toBase: 14.7868, singular: 'tbsp', plural: 'tbsp' },
  { id: 'cup', dimension: 'volume', toBase: 236.588, singular: 'cup', plural: 'cups' },
  { id: 'fl oz', dimension: 'volume', toBase: 29.5735, singular: 'fl oz', plural: 'fl oz' },
  { id: 'pint', dimension: 'volume', toBase: 473.176, singular: 'pint', plural: 'pints' },
  { id: 'quart', dimension: 'volume', toBase: 946.353, singular: 'quart', plural: 'quarts' },
  { id: 'gallon', dimension: 'volume', toBase: 3785.41, singular: 'gallon', plural: 'gallons' },
  { id: 'ml', dimension: 'volume', toBase: 1, singular: 'ml', plural: 'ml' },
  { id: 'l', dimension: 'volume', toBase: 1000, singular: 'L', plural: 'L' },
  { id: 'mg', dimension: 'mass', toBase: 0.001, singular: 'mg', plural: 'mg' },
  { id: 'g', dimension: 'mass', toBase: 1, singular: 'g', plural: 'g' },
  { id: 'kg', dimension: 'mass', toBase: 1000, singular: 'kg', plural: 'kg' },
  { id: 'oz', dimension: 'mass', toBase: 28.3495, singular: 'oz', plural: 'oz' },
  { id: 'lb', dimension: 'mass', toBase: 453.592, singular: 'lb', plural: 'lb' },
  { id: 'clove', dimension: 'other', toBase: 1, singular: 'clove', plural: 'cloves' },
  { id: 'pinch', dimension: 'other', toBase: 1, singular: 'pinch', plural: 'pinches' },
  { id: 'dash', dimension: 'other', toBase: 1, singular: 'dash', plural: 'dashes' },
  { id: 'bunch', dimension: 'other', toBase: 1, singular: 'bunch', plural: 'bunches' },
  { id: 'slice', dimension: 'other', toBase: 1, singular: 'slice', plural: 'slices' },
  { id: 'piece', dimension: 'other', toBase: 1, singular: 'piece', plural: 'pieces' },
  { id: 'sprig', dimension: 'other', toBase: 1, singular: 'sprig', plural: 'sprigs' },
  { id: 'stalk', dimension: 'other', toBase: 1, singular: 'stalk', plural: 'stalks' },
  { id: 'head', dimension: 'other', toBase: 1, singular: 'head', plural: 'heads' },
  { id: 'handful', dimension: 'other', toBase: 1, singular: 'handful', plural: 'handfuls' },
  { id: 'stick', dimension: 'other', toBase: 1, singular: 'stick', plural: 'sticks' },
  { id: 'can', dimension: 'other', toBase: 1, singular: 'can', plural: 'cans', packaged: true },
  { id: 'jar', dimension: 'other', toBase: 1, singular: 'jar', plural: 'jars', packaged: true },
  { id: 'bottle', dimension: 'other', toBase: 1, singular: 'bottle', plural: 'bottles', packaged: true },
  { id: 'package', dimension: 'other', toBase: 1, singular: 'package', plural: 'packages', packaged: true },
  { id: 'bag', dimension: 'other', toBase: 1, singular: 'bag', plural: 'bags', packaged: true },
  { id: 'box', dimension: 'other', toBase: 1, singular: 'box', plural: 'boxes', packaged: true },
  { id: 'container', dimension: 'other', toBase: 1, singular: 'container', plural: 'containers', packaged: true },
];

const ALIASES: Record<string, UnitId> = {
  tsp: 'tsp', tsps: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp',
  tbsp: 'tbsp', tbsps: 'tbsp', tbs: 'tbsp', tbl: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp',
  cup: 'cup', cups: 'cup', c: 'cup',
  'fl oz': 'fl oz', 'fl. oz': 'fl oz', floz: 'fl oz', 'fluid ounce': 'fl oz', 'fluid ounces': 'fl oz',
  pint: 'pint', pints: 'pint', pt: 'pint',
  quart: 'quart', quarts: 'quart', qt: 'quart',
  gallon: 'gallon', gallons: 'gallon', gal: 'gallon',
  ml: 'ml', milliliter: 'ml', milliliters: 'ml', millilitre: 'ml', millilitres: 'ml',
  l: 'l', liter: 'l', liters: 'l', litre: 'l', litres: 'l',
  mg: 'mg', milligram: 'mg', milligrams: 'mg',
  g: 'g', gm: 'g', gram: 'g', grams: 'g',
  kg: 'kg', kilogram: 'kg', kilograms: 'kg', kilo: 'kg', kilos: 'kg',
  oz: 'oz', ounce: 'oz', ounces: 'oz',
  lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
  clove: 'clove', cloves: 'clove',
  pinch: 'pinch', pinches: 'pinch',
  dash: 'dash', dashes: 'dash',
  bunch: 'bunch', bunches: 'bunch',
  slice: 'slice', slices: 'slice',
  piece: 'piece', pieces: 'piece', pc: 'piece', pcs: 'piece',
  sprig: 'sprig', sprigs: 'sprig',
  stalk: 'stalk', stalks: 'stalk',
  head: 'head', heads: 'head',
  handful: 'handful', handfuls: 'handful',
  stick: 'stick', sticks: 'stick',
  can: 'can', cans: 'can', tin: 'can', tins: 'can',
  jar: 'jar', jars: 'jar',
  bottle: 'bottle', bottles: 'bottle',
  package: 'package', packages: 'package', pkg: 'package', packet: 'package', packets: 'package',
  bag: 'bag', bags: 'bag',
  box: 'box', boxes: 'box',
  container: 'container', containers: 'container',
};

const BY_ID = new Map(DEFS.map((d) => [d.id, d]));

/** Resolves a unit word as written in a recipe. Case matters only for "T" (tbsp) and "t" (tsp). */
export function lookupUnit(token: string): UnitDef | undefined {
  const t = token.trim().replace(/\.$/, '');
  if (t === 'T' || t === 'Tb') return BY_ID.get('tbsp');
  if (t === 't') return BY_ID.get('tsp');
  const id = ALIASES[t.toLowerCase().replace(/\s+/g, ' ')];
  return id === undefined ? undefined : BY_ID.get(id);
}

export function getUnit(id: UnitId): UnitDef | undefined {
  return BY_ID.get(id);
}

/** A missing unit means a plain count ("3 eggs"). Unknown ids are treated as "other". */
export function dimensionOf(unit: UnitId | undefined): Dimension {
  if (unit === undefined) return 'count';
  return BY_ID.get(unit)?.dimension ?? 'other';
}

export function isPackagedUnit(id: UnitId): boolean {
  return BY_ID.get(id)?.packaged === true;
}

/** Converts to mL (volume) or g (mass). Other dimensions are returned unchanged. */
export function toBaseUnits(value: number, unit: UnitId): number {
  return value * (BY_ID.get(unit)?.toBase ?? 1);
}

export function unitLabel(id: UnitId, value: number): string {
  const def = BY_ID.get(id);
  if (!def) return id;
  return value > 1 ? def.plural : def.singular;
}

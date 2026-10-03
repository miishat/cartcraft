export type UnitId = string;
export type Dimension = 'volume' | 'mass' | 'count' | 'other';
export type UnitSystem = 'us' | 'metric';
export type SizeWord = 'small' | 'medium' | 'large';

/** `max` is set only for ranges such as "2-3". Values are never rounded. */
export interface Quantity {
  min: number;
  max?: number;
}

export interface PackageSize {
  quantity: number;
  unit: UnitId;
}

/** One line of a recipe's method. Section names such as "Crispy onions" are headers. */
export interface RecipeStep {
  text: string;
  isHeader: boolean;
}

export interface IngredientLine {
  id: string;
  /** Original text, never discarded. */
  raw: string;
  quantity?: Quantity;
  unit?: UnitId;
  /** Display name as written, e.g. "red onion". */
  item: string;
  /** Normalized identity used for merging, e.g. "red onion". */
  itemKey: string;
  size?: SizeWord;
  packageSize?: PackageSize;
  /** Prep words and anything the parser did not understand. */
  notes: string;
  alternatives: string[];
  /** False for "to taste", "pinch", "dash" and lines without a quantity. */
  scalable: boolean;
  approximate: boolean;
  isHeader: boolean;
  needsReview: boolean;
}

export interface Amount {
  quantity: Quantity;
  unit?: UnitId;
  packageSize?: PackageSize;
}

export interface ListItem {
  id: string;
  itemKey: string;
  name: string;
  /** One entry per incompatible unit or package group. */
  amounts: Amount[];
  aisleId: string;
  group: 'aisle' | 'pantry';
  checked: boolean;
  checkedAt?: number;
  origin: 'recipe' | 'adhoc';
  fromRecipes: string[];
  notes: string;
}

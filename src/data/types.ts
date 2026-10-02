import type { IngredientLine, ListItem, UnitSystem } from '../domain';

export interface Recipe {
  id: string;
  title: string;
  sourceUrl?: string;
  rawText: string;
  baseServings: number;
  yieldText?: string;
  ingredients: IngredientLine[];
  createdAt: number;
  updatedAt: number;
}

export interface ListSource {
  recipeId: string;
  title: string;
  targetServings: number;
}

export interface ListExtras {
  swaps: { item: string; swap: string }[];
  tips: string[];
  generatedAt: number;
}

export interface ShoppingList {
  id: string;
  name: string;
  createdAt: number;
  sources: ListSource[];
  items: ListItem[];
  extras?: ListExtras;
}

export interface PantryStaple {
  itemKey: string;
}

export interface Aisle {
  id: string;
  name: string;
  order: number;
}

export interface AisleOverride {
  itemKey: string;
  aisleId: string;
  source: 'user' | 'llm';
}

export interface Settings {
  id: 'settings';
  unitSystem: UnitSystem;
  defaultServings: number;
  llm: { providerId: string; model: string };
  keepScreenOn: boolean;
  persistGranted?: boolean;
}

/** Never exported, never read by backup code. */
export interface Secrets {
  id: 'secrets';
  llmApiKey?: string;
  /** Provider the key was saved for. Missing on keys saved before this was tracked. */
  llmKeyProviderId?: string;
}

/** Everything a backup file carries. */
export interface BackupData {
  recipes: Recipe[];
  lists: ShoppingList[];
  pantryStaples: PantryStaple[];
  aisles: Aisle[];
  aisleOverrides: AisleOverride[];
  settings: Settings[];
}

export interface Snapshot {
  id: 'last-import';
  takenAt: number;
  data: BackupData;
}

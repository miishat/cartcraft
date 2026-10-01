export enum AppStatus {
  IDLE = 'IDLE',
  PROCESSING = 'PROCESSING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}

export type AppView = 'ADD' | 'LIBRARY' | 'CART';

export interface Recipe {
  id: string;
  title: string;
  summary: string;
  rawInput: string;
  isActive: boolean;
  addedAt: number;
}

export interface ShoppingListState {
  rawInput: string;
  servings: number;
  markdownResult: string;
  parsedList: ParsedSection[];
}

export interface ParsedItem {
  id: string;
  text: string;
  checked: boolean;
  swapOption?: string; 
  notes?: string[]; // New: Stores "Best cut", "Need", etc.
  sourceRecipe?: string; 
  isNote?: boolean;
}

export interface ParsedSection {
  title: string;
  items: ParsedItem[];
  type: 'aisle' | 'pantry' | 'tips' | 'header';
}

export interface LoadingStep {
  message: string;
  subMessage: string;
}

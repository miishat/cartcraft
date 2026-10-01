import { Recipe } from "../types";

/**
 * Placeholder until the replacement engine is designed.
 * Uses the first non-empty line of the input as the title.
 */
export const parseRecipe = async (input: string): Promise<Omit<Recipe, 'id' | 'isActive' | 'addedAt'>> => {
  const firstLine = input.split('\n').map(l => l.trim()).find(Boolean) ?? '';
  return {
    title: firstLine.slice(0, 60) || "Untitled Recipe",
    summary: "",
    rawInput: input
  };
};

/**
 * Placeholder until the replacement engine is designed.
 */
export const generateShoppingList = async (
  _recipes: Recipe[],
  _servings: number
): Promise<string> => {
  throw new Error("Shopping list generation is not implemented yet.");
};

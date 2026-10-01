import type { IngredientLine } from './types';

/**
 * Scales the main quantity only. Package sizes, numbers inside notes, and lines that are
 * not scalable ("to taste", "pinch") are returned unchanged.
 */
export function scaleLine(line: IngredientLine, baseServings: number, targetServings: number): IngredientLine {
  if (!line.scalable || !line.quantity || baseServings <= 0 ||
    !(targetServings > 0) || targetServings === baseServings) return line;
  const factor = targetServings / baseServings;
  const { min, max } = line.quantity;
  return {
    ...line,
    quantity: max === undefined ? { min: min * factor } : { min: min * factor, max: max * factor },
  };
}

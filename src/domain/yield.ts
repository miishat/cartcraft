export interface ParsedYield {
  servings?: number;
  yieldText?: string;
}

const SERVING_WORDS = /\b(serv(?:es|ings?)|people|persons?|portions?)\b/i;

function parseOne(value: unknown): { servings?: number; text?: string; isServing: boolean } {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? { servings: value, isServing: true } : { isServing: false };
  }
  if (typeof value !== 'string') return { isServing: false };
  const text = value.trim();
  if (!text) return { isServing: false };
  const first = /\d+(?:\.\d+)?/.exec(text);
  const n = first ? Number(first[0]) : undefined;
  if (/^\d+(?:\.\d+)?$/.test(text)) return { servings: n, isServing: true };
  if (n !== undefined && n > 0 && (SERVING_WORDS.test(text) || /^\d+\s*-\s*\d+$/.test(text))) {
    return { servings: n, text, isServing: true };
  }
  return { text, isServing: false };
}

/**
 * schema.org recipeYield is a number, a string, or an array such as ["6", "24 cookies"].
 * Ranges use the lower bound. Never defaults to 1.
 */
export function parseYield(value: unknown): ParsedYield {
  const parts = Array.isArray(value) ? value.map(parseOne) : [parseOne(value)];
  const servings = parts.find((p) => p.isServing && p.servings !== undefined)?.servings;
  const yieldText = Array.isArray(value)
    ? parts.find((p) => !p.isServing && p.text)?.text
    : parts[0]?.text;
  return {
    ...(servings !== undefined ? { servings } : {}),
    ...(yieldText ? { yieldText } : {}),
  };
}

import { numericQuantity } from 'numeric-quantity';
import type { Quantity } from './types';

/** A single number as written in recipes: "1 and 1/2", "1 1/2", "1/2", "1.5", "1,5", "1,000". */
export const NUM = String.raw`(?:\d+\s+and\s+\d+\/\d+|\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)*)`;

const LEADING_AMOUNT = new RegExp(
  String.raw`^(${NUM})(?:\s*(?:-|to|or)\s*(${NUM}))?(?=\s|$|[a-zA-Z(])`,
  'i',
);

/** Parses one NUM token without rounding. Returns undefined for anything else. */
export function toNumber(token: string): number | undefined {
  let t = token.trim().replace(/\s+and\s+/i, ' ');
  if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(t)) t = t.replace(/,/g, '');
  else t = t.replace(',', '.');
  const n = numericQuantity(t, { round: false });
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** Reads a quantity or range at the start of `text` and returns the remaining text. */
export function parseLeadingAmount(text: string): { quantity?: Quantity; rest: string } {
  const match = LEADING_AMOUNT.exec(text);
  if (!match || match[1] === undefined) return { rest: text };
  const min = toNumber(match[1]);
  if (min === undefined) return { rest: text };
  const max = match[2] === undefined ? undefined : toNumber(match[2]);
  const quantity: Quantity = max !== undefined && max > min ? { min, max } : { min };
  return { quantity, rest: text.slice(match[0].length).trim() };
}

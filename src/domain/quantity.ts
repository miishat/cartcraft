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
export function parseLeadingAmount(text: string): { quantity?: Quantity; rest: string; dropped?: string } {
  const match = LEADING_AMOUNT.exec(text);
  if (!match || match[1] === undefined) return { rest: text };
  const min = toNumber(match[1]);
  if (min === undefined) return { rest: text };
  const rest = text.slice(match[0].length).trim();
  if (match[2] === undefined) return { quantity: { min }, rest };
  const max = toNumber(match[2]);
  if (max !== undefined && max > min) return { quantity: { min, max }, rest };
  // "1-1/2" is a mixed number written with a hyphen, not a range.
  const separator = match[0].slice(match[1].length, match[0].length - match[2].length);
  if (separator === '-' && /^\d+$/.test(match[1]) && /^\d+\/\d+$/.test(match[2]) && max !== undefined && max < 1) {
    return { quantity: { min: min + max }, rest };
  }
  return { quantity: { min }, rest, dropped: match[0].slice(match[1].length).trim() };
}

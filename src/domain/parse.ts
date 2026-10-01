import { itemKey } from './itemKey';
import { NUM, parseLeadingAmount, toNumber } from './quantity';
import { normalizeText } from './text';
import type { IngredientLine, PackageSize, Quantity, SizeWord, UnitId } from './types';
import { isPackagedUnit, lookupUnit } from './units';

const MAX_LINE_LENGTH = 512;
const NON_SCALABLE_UNITS = new Set<UnitId>(['pinch', 'dash']);

const APPROXIMATE = /^(?:about|approx\.?|approximately|around|roughly|~)\s*/i;
const TO_TASTE = /,?\s*\b(?:or\s+)?(?:to taste|as needed|as required)\b\.?/gi;
const JUICE_OR_ZEST = new RegExp(String.raw`^(juice|zest) of (${NUM}) (.+)$`, 'i');
const TRAILING_TIMES = /\s+x\s?(\d+)$/i;
const LEADING_TIMES = /^x\s?(\d+)\s+/i;
/** "4 oz. can tomato paste": the amount is the package size of one container. */
const SIZE_THEN_CONTAINER = /^((?:fl\.?\s*)?[a-z]+)\.?\s+(\S+)\s+(.+)$/i;
const ARTICLE = /^an?\s+/i;
const FLUID_OUNCE = /^(?:fl\.?\s*oz\.?|fluid\s+ounces?)(?=\s)/i;
const UNIT_WORD = /^[a-zA-Z]+\.?/;
const PACKAGE = new RegExp(
  String.raw`^\(?\s*(${NUM})\s*-?\s*((?:fl\.?\s*)?[a-z]+)\.?\s*\)?\s+(\S+)\s+(.+)$`,
  'i',
);
const OUNCES_AFTER_POUNDS = new RegExp(String.raw`^(${NUM})\s*(?:oz|ounces?)\.?\s+(.+)$`, 'i');
const SIZE = /^(small|medium|large)\b,?\s*/i;

/**
 * Parses one ingredient line. Never throws and never drops text: anything not understood
 * stays in `notes` and sets `needsReview`.
 */
export function parseIngredientLine(raw: string, id: string): IngredientLine {
  const unparsed: IngredientLine = {
    id, raw, item: '', itemKey: '', notes: '', alternatives: [],
    scalable: false, approximate: false, isHeader: false, needsReview: true,
  };
  if (raw.length > MAX_LINE_LENGTH) return { ...unparsed, notes: raw };

  let text = normalizeText(raw);
  if (!text) return unparsed;

  if (text.endsWith(':') && !/^\d/.test(text)) {
    const header = text.slice(0, -1).trim();
    return { ...unparsed, item: header, isHeader: true, needsReview: false };
  }

  const notes: string[] = [];
  const alternatives: string[] = [];

  const approx = APPROXIMATE.exec(text);
  const approximate = approx !== null;
  if (approx) text = text.slice(approx[0].length);

  let toTaste = false;
  text = text.replace(TO_TASTE, () => {
    toTaste = true;
    return '';
  }).trim();

  let quantity: Quantity | undefined;
  let unclearRange = false;
  const juice = JUICE_OR_ZEST.exec(text);
  const juiceQty = juice?.[2] === undefined ? undefined : toNumber(juice[2]);
  if (juice && juiceQty !== undefined) {
    quantity = { min: juiceQty };
    notes.push((juice[1] ?? '').toLowerCase());
    text = juice[3] ?? '';
  } else {
    const lead = parseLeadingAmount(text);
    if (lead.quantity) {
      quantity = lead.quantity;
      text = lead.rest;
      if (lead.dropped) {
        notes.push(lead.dropped);
        unclearRange = true;
      }
    } else {
      const article = ARTICLE.exec(text);
      const afterArticle = article ? text.slice(article[0].length) : '';
      const articleUnit = UNIT_WORD.exec(afterArticle)?.[0];
      const leadingTimes = LEADING_TIMES.exec(text);
      if (article && articleUnit && lookupUnit(articleUnit)) {
        quantity = { min: 1 };
        text = afterArticle;
      } else if (leadingTimes?.[1] !== undefined) {
        quantity = { min: Number(leadingTimes[1]) };
        text = text.slice(leadingTimes[0].length);
      } else {
        const trailing = TRAILING_TIMES.exec(text);
        if (trailing?.[1] !== undefined) {
          quantity = { min: Number(trailing[1]) };
          text = text.slice(0, trailing.index);
        }
      }
    }
  }

  let unit: UnitId | undefined;
  let packageSize: PackageSize | undefined;

  if (quantity) {
    const pkg = PACKAGE.exec(text);
    if (pkg) {
      const sizeQty = toNumber(pkg[1] ?? '');
      const sizeUnit = lookupUnit(pkg[2] ?? '');
      const container = lookupUnit(pkg[3] ?? '');
      if (
        sizeQty !== undefined && sizeUnit && container && isPackagedUnit(container.id) &&
        (sizeUnit.dimension === 'mass' || sizeUnit.dimension === 'volume')
      ) {
        packageSize = { quantity: sizeQty, unit: sizeUnit.id };
        unit = container.id;
        text = pkg[4] ?? '';
      }
    }
    if (!unit && quantity.max === undefined) {
      const sized = SIZE_THEN_CONTAINER.exec(text);
      const sizeUnit = lookupUnit(sized?.[1] ?? '');
      const container = lookupUnit(sized?.[2] ?? '');
      if (
        sized && sizeUnit && container && isPackagedUnit(container.id) &&
        (sizeUnit.dimension === 'mass' || sizeUnit.dimension === 'volume')
      ) {
        packageSize = { quantity: quantity.min, unit: sizeUnit.id };
        quantity = { min: 1 };
        unit = container.id;
        text = sized[3] ?? '';
      }
    }
  }

  if (!unit) {
    const fluid = FLUID_OUNCE.exec(text);
    if (fluid && quantity && text.slice(fluid[0].length).trim()) {
      unit = 'fl oz';
      text = text.slice(fluid[0].length).trim();
    } else {
      const word = UNIT_WORD.exec(text)?.[0] ?? '';
      const def = word ? lookupUnit(word) : undefined;
      const remaining = text.slice(word.length).trim();
      if (def && remaining && (quantity || NON_SCALABLE_UNITS.has(def.id))) {
        unit = def.id;
        text = remaining;
        quantity ??= { min: 1 };
      }
    }
    if (unit) text = text.replace(/^of\s+/i, '');
  }

  if (unit === 'lb' && quantity && quantity.max === undefined) {
    const ounces = OUNCES_AFTER_POUNDS.exec(text);
    const ozQty = ounces?.[1] === undefined ? undefined : toNumber(ounces[1]);
    if (ounces && ozQty !== undefined) {
      quantity = { min: quantity.min * 16 + ozQty };
      unit = 'oz';
      text = ounces[2] ?? '';
    }
  }

  let size: SizeWord | undefined;
  const sizeMatch = SIZE.exec(text);
  if (sizeMatch?.[1] !== undefined) {
    size = sizeMatch[1].toLowerCase() as SizeWord;
    text = text.slice(sizeMatch[0].length);
  }

  text = text
    .replace(/\(([^)]*)\)/g, (_m, inner: string) => {
      const content = inner.trim();
      const alternative = /^or\s+(.+)$/i.exec(content);
      if (alternative?.[1] !== undefined) alternatives.push(alternative[1].trim());
      else if (content) notes.push(content);
      return ' ';
    })
    .replace(/\s+/g, ' ')
    .trim();

  const comma = text.indexOf(',');
  let item = (comma >= 0 ? text.slice(0, comma) : text).trim();
  if (comma >= 0) {
    const rest = text.slice(comma + 1).trim();
    if (rest) notes.push(rest);
  }
  const options = item.split(/\s+or\s+/i);
  if (options.length > 1) {
    item = (options[0] ?? '').trim();
    alternatives.push(...options.slice(1).map((o) => o.trim()));
  }
  if (toTaste) notes.push('to taste');

  const needsReview =
    unclearRange ||
    !item ||
    /\s+and\s+/i.test(item) ||
    notes.some((n) => /^plus\b/i.test(n)) ||
    // "2 cups" with nothing after it: the unit word ended up as the item.
    (unit === undefined && lookupUnit(item) !== undefined) ||
    // "1 large egg or 2 egg whites": the alternative needs its own amount.
    alternatives.some((a) => /^\d/.test(a)) ||
    (quantity !== undefined && quantity.min === 0 && quantity.max === undefined);
  const scalable =
    quantity !== undefined && !toTaste && !(unit !== undefined && NON_SCALABLE_UNITS.has(unit));

  return {
    id,
    raw,
    ...(quantity ? { quantity } : {}),
    ...(unit ? { unit } : {}),
    item,
    itemKey: itemKey(item),
    ...(size ? { size } : {}),
    ...(packageSize ? { packageSize } : {}),
    notes: notes.join(', '),
    alternatives,
    scalable,
    approximate,
    isHeader: false,
    needsReview,
  };
}

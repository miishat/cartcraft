const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  frac12: '½', frac14: '¼', frac34: '¾', frac13: '⅓', frac23: '⅔',
  frac18: '⅛', frac38: '⅜', frac58: '⅝', frac78: '⅞',
  deg: '°', ndash: '-', mdash: '-', hellip: '...',
  rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"',
};

function decodeOnce(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (match, body: string) => {
    if (body.startsWith('#')) {
      const hex = body[1] === 'x' || body[1] === 'X';
      const code = hex ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

/** Decodes HTML entities, repeating to undo double encoding such as "&amp;frac12;". */
export function decodeEntities(s: string): string {
  let current = s;
  for (let i = 0; i < 3; i++) {
    const next = decodeOnce(current);
    if (next === current) break;
    current = next;
  }
  return current;
}

const UNICODE_FRACTIONS: Record<string, string> = {
  '½': '1/2', '⅓': '1/3', '⅔': '2/3', '¼': '1/4', '¾': '3/4',
  '⅕': '1/5', '⅖': '2/5', '⅗': '3/5', '⅘': '4/5', '⅙': '1/6', '⅚': '5/6',
  '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8',
};

/** Entities, unicode fractions and dashes, bullets, footnote markers and whitespace. */
export function normalizeText(raw: string): string {
  let s = decodeEntities(raw);
  s = s.replace(/[   ]/g, ' ');
  s = s.replace(/⁄/g, '/');
  s = s.replace(/[‐-―−]/g, '-');
  s = s.replace(/(\d)?([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/g, (_m, digit: string | undefined, frac: string) =>
    (digit ? `${digit} ` : '') + (UNICODE_FRACTIONS[frac] ?? frac),
  );
  s = s.replace(/^\s*(?:[-*•·▢□◦]+\s*)+/, '');
  s = s.replace(/[*†‡]+/g, '');
  return s.replace(/\s+/g, ' ').trim();
}

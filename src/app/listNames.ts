/** Name ideas shown as chips when building a list: one from the recipes, one from the day. No AI. */
export function listNameSuggestions(titles: string[], now: number): string[] {
  const named = titles.map((t) => t.trim()).filter(Boolean);
  const chips: string[] = [];
  if (named.length === 1) chips.push(named[0]!);
  else if (named.length === 2) chips.push(`${named[0]} + ${named[1]}`);
  else if (named.length > 2) chips.push(`${named[0]} + ${named.length - 1} more`);
  const day = new Date(now).getDay();
  chips.push(day === 0 || day === 5 || day === 6 ? 'Weekend shop' : 'Weeknight dinners');
  return chips;
}

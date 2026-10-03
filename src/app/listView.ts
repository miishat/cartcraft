import { OTHER_AISLE, formatAmounts, type ListItem, type UnitSystem } from '../domain';
import type { Aisle } from '../data/types';

export interface ListSection {
  id: string;
  title: string;
  items: ListItem[];
}

export interface ListView {
  /** Unchecked aisle items, in the user's aisle order. Empty aisles are omitted. */
  aisles: ListSection[];
  /** Unchecked pantry staples ("Check pantry"). */
  pantry: ListItem[];
  /** Checked items, most recently checked first. */
  inCart: ListItem[];
}

const byName = (a: ListItem, b: ListItem) => a.name.localeCompare(b.name);

/** Groups list items for shopping mode. Items with an unknown aisle id fall into Other. */
export function groupListItems(items: ListItem[], aisles: Aisle[]): ListView {
  const ordered = [...aisles].sort((a, b) => a.order - b.order);
  const known = new Set(ordered.map((a) => a.id));
  const unchecked = items.filter((i) => !i.checked);

  const sections = ordered
    .map((aisle): ListSection => ({
      id: aisle.id,
      title: aisle.name,
      items: unchecked
        .filter((i) => i.group === 'aisle' && (known.has(i.aisleId) ? i.aisleId : OTHER_AISLE) === aisle.id)
        .sort(byName),
    }))
    .filter((s) => s.items.length > 0);

  // A backup or edit can leave items pointing at aisles that no longer exist. Never hide them.
  if (!known.has(OTHER_AISLE)) {
    const orphans = unchecked.filter((i) => i.group === 'aisle' && !known.has(i.aisleId)).sort(byName);
    if (orphans.length > 0) sections.push({ id: OTHER_AISLE, title: 'Other', items: orphans });
  }

  return {
    aisles: sections,
    pantry: unchecked.filter((i) => i.group === 'pantry').sort(byName),
    inCart: items.filter((i) => i.checked).sort((a, b) => (b.checkedAt ?? 0) - (a.checkedAt ?? 0)),
  };
}

export function itemLabel(item: ListItem, system: UnitSystem): string {
  const amount = formatAmounts(item.amounts, system, item.name);
  const name = item.name.charAt(0).toUpperCase() + item.name.slice(1);
  return amount ? `${name}: ${amount}` : name;
}

/**
 * Text shown in the item editor. `editItem` parses it back, so the amount, name and notes
 * ("2 cups milk, whole") all survive an edit.
 */
export function itemEditText(item: ListItem, system: UnitSystem): string {
  const amount = formatAmounts(item.amounts, system, item.name);
  const base = amount ? `${amount} ${item.name}` : item.name;
  return item.notes ? `${base}, ${item.notes}` : base;
}

/** Plain text for "Copy list": unchecked items only, grouped by aisle, then pantry. */
export function listAsText(name: string, items: ListItem[], aisles: Aisle[], system: UnitSystem): string {
  const view = groupListItems(items, aisles);
  const blocks = [name];
  for (const section of view.aisles) {
    blocks.push([section.title, ...section.items.map((i) => `- ${itemLabel(i, system)}`)].join('\n'));
  }
  if (view.pantry.length > 0) {
    blocks.push(['Check pantry', ...view.pantry.map((i) => `- ${itemLabel(i, system)}`)].join('\n'));
  }
  return blocks.join('\n\n');
}

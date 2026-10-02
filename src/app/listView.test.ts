import { describe, expect, it } from 'vitest';
import type { ListItem } from '../domain';
import type { Aisle } from '../data/types';
import { groupListItems, itemEditText, itemLabel, listAsText } from './listView';

const aisles: Aisle[] = [
  { id: 'dairy-eggs', name: 'Dairy & Eggs', order: 1 },
  { id: 'produce', name: 'Produce', order: 0 },
  { id: 'other', name: 'Other', order: 2 },
];

function item(id: string, name: string, patch: Partial<ListItem> = {}): ListItem {
  return {
    id, itemKey: name, name, amounts: [], aisleId: 'produce', group: 'aisle', checked: false,
    origin: 'recipe', fromRecipes: [], notes: '', ...patch,
  };
}

describe('groupListItems', () => {
  it('orders sections by aisle order, sorts items by name and drops empty aisles', () => {
    const view = groupListItems(
      [item('1', 'onion'), item('2', 'egg', { aisleId: 'dairy-eggs' }), item('3', 'apple')],
      aisles,
    );
    expect(view.aisles.map((s) => [s.title, s.items.map((i) => i.name)])).toEqual([
      ['Produce', ['apple', 'onion']],
      ['Dairy & Eggs', ['egg']],
    ]);
  });

  it('puts pantry items and checked items in their own groups', () => {
    const view = groupListItems(
      [
        item('1', 'salt', { group: 'pantry' }),
        item('2', 'onion', { checked: true, checkedAt: 10 }),
        item('3', 'apple', { checked: true, checkedAt: 20 }),
      ],
      aisles,
    );
    expect(view.aisles).toEqual([]);
    expect(view.pantry.map((i) => i.name)).toEqual(['salt']);
    expect(view.inCart.map((i) => i.name)).toEqual(['apple', 'onion']);
  });

  it('sends items with an unknown aisle to Other', () => {
    const view = groupListItems([item('1', 'thing', { aisleId: 'deleted-aisle' })], aisles);
    expect(view.aisles.map((s) => s.id)).toEqual(['other']);
  });
});

describe('itemLabel and listAsText', () => {
  it('capitalizes and appends formatted amounts', () => {
    expect(itemLabel(item('1', 'milk', { amounts: [{ quantity: { min: 354.882 }, unit: 'ml' }] }), 'us')).toBe('Milk: 1 1/2 cups');
    expect(itemLabel(item('2', 'paper towels'), 'us')).toBe('Paper towels');
  });

  it('renders unchecked items grouped by aisle, then pantry', () => {
    const text = listAsText(
      'Weekend',
      [
        item('1', 'onion', { amounts: [{ quantity: { min: 2 } }] }),
        item('2', 'egg', { aisleId: 'dairy-eggs', amounts: [{ quantity: { min: 6 } }] }),
        item('3', 'salt', { group: 'pantry' }),
        item('4', 'apple', { checked: true }),
      ],
      aisles,
      'us',
    );
    expect(text).toBe('Weekend\n\nProduce\n- Onion: 2\n\nDairy & Eggs\n- Egg: 6\n\nCheck pantry\n- Salt');
  });
});

describe('items in aisles that no longer exist', () => {
  it('still appear in an Other section when the Other aisle is missing', () => {
    const view = groupListItems([item('1', 'thing', { aisleId: 'gone' })], aisles.filter((a) => a.id !== 'other'));
    expect(view.aisles.map((s) => [s.id, s.title, s.items.map((i) => i.name)])).toEqual([['other', 'Other', ['thing']]]);
  });
});

describe('itemEditText', () => {
  it('includes amount, name and notes', () => {
    expect(itemEditText(item('1', 'milk', { amounts: [{ quantity: { min: 473.176 }, unit: 'ml' }], notes: 'whole' }), 'us')).toBe('2 cups milk, whole');
    expect(itemEditText(item('2', 'paper towels'), 'us')).toBe('paper towels');
  });
});

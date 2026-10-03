import { describe, expect, it } from 'vitest';
import { defaultListName } from './lists';
import { listNameSuggestions } from './listNames';

const FRI = new Date(2026, 9, 2, 12).getTime();
const TUE = new Date(2026, 9, 6, 12).getTime();

describe('list names', () => {
  it('defaults to Groceries and the day', () => {
    expect(defaultListName(FRI)).toBe('Groceries, Fri Oct 2');
  });

  it.each([
    [['Biryani'], FRI, ['Biryani', 'Weekend shop']],
    [['Biryani', 'Tacos'], TUE, ['Biryani + Tacos', 'Weeknight dinners']],
    [['Biryani', 'Tacos', 'Soup'], TUE, ['Biryani + 2 more', 'Weeknight dinners']],
    [[], TUE, ['Weeknight dinners']],
  ])('suggests from %j', (titles, now, expected) => {
    expect(listNameSuggestions(titles, now)).toEqual(expected);
  });
});

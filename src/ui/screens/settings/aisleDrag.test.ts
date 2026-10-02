import { describe, expect, it } from 'vitest';
import { dropIndex, rowShift } from './aisleDrag';

describe('dropIndex', () => {
  it('moves one place per row height, rounding to the nearest row', () => {
    expect(dropIndex(0, 0, 48, 11)).toBe(0);
    expect(dropIndex(0, 30, 48, 11)).toBe(1);
    expect(dropIndex(0, 100, 48, 11)).toBe(2);
    expect(dropIndex(5, -50, 48, 11)).toBe(4);
  });

  it('stays inside the list', () => {
    expect(dropIndex(1, -500, 48, 11)).toBe(0);
    expect(dropIndex(9, 500, 48, 11)).toBe(10);
  });
});

describe('rowShift', () => {
  it('moves rows between the old and new place to make room', () => {
    // Dragging row 1 down to 3: rows 2 and 3 move up.
    expect(rowShift(2, 1, 3, 48)).toBe(-48);
    expect(rowShift(3, 1, 3, 48)).toBe(-48);
    expect(rowShift(4, 1, 3, 48)).toBe(0);
    expect(rowShift(0, 1, 3, 48)).toBe(0);
    // Dragging row 4 up to 2: rows 2 and 3 move down.
    expect(rowShift(2, 4, 2, 48)).toBe(48);
    expect(rowShift(3, 4, 2, 48)).toBe(48);
    expect(rowShift(1, 4, 2, 48)).toBe(0);
  });
});

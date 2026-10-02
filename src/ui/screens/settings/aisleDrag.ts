/** The place a dragged row lands after moving `offset` pixels, one place per row height. */
export function dropIndex(from: number, offset: number, rowHeight: number, count: number): number {
  return Math.min(Math.max(0, from + Math.round(offset / rowHeight)), count - 1);
}

/** How far a row that is not being dragged moves to make room for the dragged one. */
export function rowShift(index: number, from: number, to: number, rowHeight: number): number {
  if (from < to && index > from && index <= to) return -rowHeight;
  if (from > to && index >= to && index < from) return rowHeight;
  return 0;
}

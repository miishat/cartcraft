import type { Amount, PackageSize, UnitId, UnitSystem } from './types';
import { dimensionOf, getUnit, isPackagedUnit, toBaseUnits, unitLabel } from './units';

interface Step {
  value: number;
  label: string;
}

const KITCHEN_STEPS: Step[] = [
  { value: 0, label: '' }, { value: 1 / 8, label: '1/8' }, { value: 1 / 4, label: '1/4' },
  { value: 1 / 3, label: '1/3' }, { value: 3 / 8, label: '3/8' }, { value: 1 / 2, label: '1/2' },
  { value: 5 / 8, label: '5/8' }, { value: 2 / 3, label: '2/3' }, { value: 3 / 4, label: '3/4' },
  { value: 7 / 8, label: '7/8' }, { value: 1, label: '' },
];

const QUARTER_STEPS: Step[] = [
  { value: 0, label: '' }, { value: 1 / 4, label: '1/4' }, { value: 1 / 2, label: '1/2' },
  { value: 3 / 4, label: '3/4' }, { value: 1, label: '' },
];

const EPSILON = 1e-6;

/** Snaps to the nearest step and renders "1 1/2", "1/3", "2". */
export function formatFraction(n: number, steps: Step[] = KITCHEN_STEPS): string {
  let whole = Math.floor(n + EPSILON);
  const frac = n - whole;
  let best = 0;
  for (let i = 1; i < steps.length; i++) {
    if (Math.abs(frac - (steps[i]?.value ?? 0)) < Math.abs(frac - (steps[best]?.value ?? 0))) best = i;
  }
  if (best === steps.length - 1) {
    whole += 1;
    best = 0;
  }
  const label = steps[best]?.label ?? '';
  if (whole === 0) return label || '0';
  return label ? `${whole} ${label}` : `${whole}`;
}

function formatDecimal(n: number, maxDecimals: number): string {
  return String(Number(n.toFixed(maxDecimals)));
}

interface Rendered {
  unit: UnitId;
  render: (value: number) => string;
}

function pickVolume(minMl: number, system: UnitSystem): Rendered | 'pinch' {
  if (system === 'metric') {
    if (minMl < 999.5) return { unit: 'ml', render: (v) => formatDecimal(v, v < 10 ? 1 : 0) };
    return { unit: 'l', render: (v) => formatDecimal(v / 1000, 2) };
  }
  for (const unit of ['cup', 'tbsp', 'tsp'] as const) {
    const size = getUnit(unit)?.toBase ?? 1;
    if (minMl / size >= 1 - EPSILON) return { unit, render: (v) => formatFraction(v / size) };
  }
  const tsp = getUnit('tsp')?.toBase ?? 1;
  if (minMl / tsp < 1 / 8 - EPSILON) return 'pinch';
  return { unit: 'tsp', render: (v) => formatFraction(v / tsp) };
}

function pickMass(minG: number, system: UnitSystem): Rendered {
  if (system === 'metric') {
    if (minG < 999.5) return { unit: 'g', render: (v) => formatDecimal(v, v < 10 ? 1 : 0) };
    return { unit: 'kg', render: (v) => formatDecimal(v / 1000, 2) };
  }
  const oz = getUnit('oz')?.toBase ?? 1;
  const lb = getUnit('lb')?.toBase ?? 1;
  if (minG / oz < 16 - EPSILON) return { unit: 'oz', render: (v) => formatFraction(v / oz, QUARTER_STEPS) };
  return { unit: 'lb', render: (v) => formatFraction(v / lb, QUARTER_STEPS) };
}

const METRIC_UNITS = new Set<UnitId>(['mg', 'g', 'kg', 'ml', 'l']);

/** Package sizes read as printed on the label, converted only when the label uses the other unit system. */
function formatPackageSize(size: PackageSize, system: UnitSystem): string {
  if (METRIC_UNITS.has(size.unit) === (system === 'metric')) {
    return `${formatDecimal(size.quantity, 2)} ${unitLabel(size.unit, size.quantity)}`;
  }
  return formatAmount({ quantity: { min: size.quantity }, unit: size.unit }, system);
}

function withRange(min: string, max: string | undefined): string {
  return max === undefined || max === min ? min : `${min}-${max}`;
}

/** Formats one amount in the user's unit system. Counts and discrete units round up. */
export function formatAmount(amount: Amount, system: UnitSystem): string {
  const { quantity, unit, packageSize } = amount;
  const dimension = dimensionOf(unit);

  if (unit !== undefined && (dimension === 'volume' || dimension === 'mass')) {
    const minBase = toBaseUnits(quantity.min, unit);
    const maxBase = quantity.max === undefined ? undefined : toBaseUnits(quantity.max, unit);
    const picked = dimension === 'volume' ? pickVolume(minBase, system) : pickMass(minBase, system);
    if (picked === 'pinch') return 'pinch';
    const size = getUnit(picked.unit)?.toBase ?? 1;
    const min = picked.render(minBase);
    const max = maxBase === undefined ? undefined : picked.render(maxBase);
    return `${withRange(min, max)} ${unitLabel(picked.unit, (maxBase ?? minBase) / size)}`;
  }

  const min = Math.ceil(quantity.min - EPSILON);
  const max = quantity.max === undefined ? undefined : Math.ceil(quantity.max - EPSILON);
  const count = withRange(String(min), max === undefined ? undefined : String(max));
  if (unit === undefined) return count;
  const label = unitLabel(unit, max ?? min);
  if (packageSize && isPackagedUnit(unit)) {
    return `${count} ${label} (${formatPackageSize(packageSize, system)})`;
  }
  return `${count} ${label}`;
}

export function formatAmounts(amounts: Amount[], system: UnitSystem): string {
  return amounts.map((a) => formatAmount(a, system)).join(' + ');
}

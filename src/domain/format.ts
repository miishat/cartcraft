import type { Amount, PackageSize, UnitId, UnitSystem } from './types';
import { solidDensity } from './density';
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

function snap(n: number, steps: Step[]): { whole: number; label: string; value: number } {
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
  return { whole, label: steps[best]?.label ?? '', value: whole + (steps[best]?.value ?? 0) };
}

/** Snaps to the nearest step and renders "1 1/2", "1/3", "2". */
export function formatFraction(n: number, steps: Step[] = KITCHEN_STEPS): string {
  const { whole, label } = snap(n, steps);
  if (whole === 0) return label || '0';
  return label ? `${whole} ${label}` : `${whole}`;
}

/** The numeric value formatFraction would display, used to pick singular or plural labels. */
function snappedValue(n: number, steps: Step[] = KITCHEN_STEPS): number {
  return snap(n, steps).value;
}

function formatDecimal(n: number, maxDecimals: number): string {
  return String(Number(n.toFixed(maxDecimals)));
}

interface Rendered {
  unit: UnitId;
  render: (value: number) => string;
  /** The number actually displayed for `value`, in the picked unit. */
  shown: (value: number) => number;
}

/** Cups read well only as whole cups or these kitchen fractions. */
const CUP_FRACTIONS = [1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4];

function pickVolume(minMl: number, system: UnitSystem): Rendered | 'pinch' {
  if (system === 'metric') {
    if (minMl < 999.5) {
      return { unit: 'ml', render: (v) => formatDecimal(v, v < 10 ? 1 : 0), shown: (v) => Number(v.toFixed(v < 10 ? 1 : 0)) };
    }
    return { unit: 'l', render: (v) => formatDecimal(v / 1000, 2), shown: (v) => Number((v / 1000).toFixed(2)) };
  }
  const cupSize = getUnit('cup')?.toBase ?? 1;
  const cups = minMl / cupSize;
  const cupOk = cups >= 1 - EPSILON || CUP_FRACTIONS.some((f) => Math.abs(cups - f) < 1e-3);
  for (const unit of ['cup', 'tbsp', 'tsp'] as const) {
    if (unit === 'cup' && !cupOk) continue;
    const size = getUnit(unit)?.toBase ?? 1;
    if (unit === 'cup' || minMl / size >= 1 - EPSILON) {
      return { unit, render: (v) => formatFraction(v / size), shown: (v) => snappedValue(v / size) };
    }
  }
  const tsp = getUnit('tsp')?.toBase ?? 1;
  if (minMl / tsp < 1 / 8 - EPSILON) return 'pinch';
  return { unit: 'tsp', render: (v) => formatFraction(v / tsp), shown: (v) => snappedValue(v / tsp) };
}

function pickMass(minG: number, system: UnitSystem): Rendered {
  if (system === 'metric') {
    if (minG < 999.5) {
      return { unit: 'g', render: (v) => formatDecimal(v, v < 10 ? 1 : 0), shown: (v) => Number(v.toFixed(v < 10 ? 1 : 0)) };
    }
    return { unit: 'kg', render: (v) => formatDecimal(v / 1000, 2), shown: (v) => Number((v / 1000).toFixed(2)) };
  }
  const oz = getUnit('oz')?.toBase ?? 1;
  const lb = getUnit('lb')?.toBase ?? 1;
  // From half a pound up, amounts read the way meat and produce are sold.
  if (minG / oz < 8 - EPSILON) return { unit: 'oz', render: (v) => formatFraction(v / oz, QUARTER_STEPS), shown: (v) => snappedValue(v / oz, QUARTER_STEPS) };
  return { unit: 'lb', render: (v) => formatFraction(v / lb, QUARTER_STEPS), shown: (v) => snappedValue(v / lb, QUARTER_STEPS) };
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
export function formatAmount(amount: Amount, system: UnitSystem, item?: string): string {
  const { quantity, unit, packageSize } = amount;
  if (quantity.min <= 0 && (quantity.max ?? 0) <= 0) return '';
  const dimension = dimensionOf(unit);

  if (unit !== undefined && (dimension === 'volume' || dimension === 'mass')) {
    // Metric cooks weigh solids: a volume of butter or parsley shows in grams, not mL.
    const density = system === 'metric' && dimension === 'volume' ? solidDensity(item) : undefined;
    const factor = density ?? 1;
    const minBase = toBaseUnits(quantity.min, unit) * factor;
    const maxBase = quantity.max === undefined ? undefined : toBaseUnits(quantity.max, unit) * factor;
    const asMass = dimension === 'mass' || density !== undefined;
    const picked = asMass ? pickMass(minBase, system) : pickVolume(minBase, system);
    if (picked === 'pinch') return 'pinch';
    const min = picked.render(minBase);
    const max = maxBase === undefined ? undefined : picked.render(maxBase);
    return `${withRange(min, max)} ${unitLabel(picked.unit, picked.shown(maxBase ?? minBase))}`;
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

export function formatAmounts(amounts: Amount[], system: UnitSystem, item?: string): string {
  return amounts.map((a) => formatAmount(a, system, item)).filter(Boolean).join(' + ');
}

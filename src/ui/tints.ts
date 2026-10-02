export type Tint = 'green' | 'red' | 'blue' | 'amber' | 'orange' | 'purple' | 'teal' | 'sky' | 'rose' | 'gray';

/** Full class strings so Tailwind can see them. Background and matching foreground. */
export const TINT_CLASS: Record<Tint, string> = {
  green: 'bg-tint-green-bg text-tint-green-fg',
  red: 'bg-tint-red-bg text-tint-red-fg',
  blue: 'bg-tint-blue-bg text-tint-blue-fg',
  amber: 'bg-tint-amber-bg text-tint-amber-fg',
  orange: 'bg-tint-orange-bg text-tint-orange-fg',
  purple: 'bg-tint-purple-bg text-tint-purple-fg',
  teal: 'bg-tint-teal-bg text-tint-teal-fg',
  sky: 'bg-tint-sky-bg text-tint-sky-fg',
  rose: 'bg-tint-rose-bg text-tint-rose-fg',
  gray: 'bg-tint-gray-bg text-tint-gray-fg',
};

/** Recipe covers use every tint except grey, which reads as disabled. */
export const RECIPE_TINTS: readonly Tint[] = ['green', 'red', 'blue', 'amber', 'orange', 'purple', 'teal', 'sky', 'rose'];

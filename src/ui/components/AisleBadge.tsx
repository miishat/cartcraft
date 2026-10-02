import { aisleEmoji, aisleTint } from '../aisleIcons';
import { TINT_CLASS } from '../tints';

const SIZE = {
  sm: 'h-5 w-5 rounded-md text-xs',
  md: 'h-7 w-7 rounded-lg text-base',
} as const;

/** The aisle's emoji on its tinted square. Decorative: the aisle name is always next to it. */
export function AisleBadge({ aisleId, size = 'md' }: { aisleId: string; size?: 'sm' | 'md' }) {
  return (
    <span
      aria-hidden="true"
      data-aisle-badge={aisleId}
      className={`inline-flex shrink-0 items-center justify-center leading-none ${SIZE[size]} ${TINT_CLASS[aisleTint(aisleId)]}`}
    >
      {aisleEmoji(aisleId)}
    </span>
  );
}

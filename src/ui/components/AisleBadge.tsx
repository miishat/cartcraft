import { aisleIcon, aisleTint } from '../aisleIcons';
import { TINT_CLASS } from '../tints';

const SIZE = {
  sm: { box: 'h-5 w-5 rounded-md', icon: 12 },
  md: { box: 'h-7 w-7 rounded-lg', icon: 16 },
} as const;

/** The aisle's icon on its tinted square. Decorative: the aisle name is always next to it. */
export function AisleBadge({ aisleId, size = 'md' }: { aisleId: string; size?: 'sm' | 'md' }) {
  const Icon = aisleIcon(aisleId);
  const s = SIZE[size];
  return (
    <span aria-hidden="true" data-aisle-badge={aisleId} className={`inline-flex shrink-0 items-center justify-center ${s.box} ${TINT_CLASS[aisleTint(aisleId)]}`}>
      <Icon size={s.icon} />
    </span>
  );
}

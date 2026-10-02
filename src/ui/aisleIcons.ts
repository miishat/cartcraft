import {
  Archive, Beef, Carrot, Croissant, CupSoda, Droplet, Milk, Package, ShoppingBasket, Snowflake, SprayCan, Wheat,
  type LucideIcon,
} from 'lucide-react';
import type { Tint } from './tints';

/** Section id for the "Check pantry" group. Not a real aisle, so it cannot clash with one. */
export const PANTRY_CHECK_ID = 'check-pantry';

const BY_AISLE: Record<string, { icon: LucideIcon; tint: Tint }> = {
  produce: { icon: Carrot, tint: 'green' },
  'meat-seafood': { icon: Beef, tint: 'red' },
  'dairy-eggs': { icon: Milk, tint: 'blue' },
  bakery: { icon: Croissant, tint: 'amber' },
  pantry: { icon: Wheat, tint: 'orange' },
  canned: { icon: Package, tint: 'teal' },
  'spices-oils': { icon: Droplet, tint: 'rose' },
  frozen: { icon: Snowflake, tint: 'sky' },
  beverages: { icon: CupSoda, tint: 'purple' },
  household: { icon: SprayCan, tint: 'gray' },
  [PANTRY_CHECK_ID]: { icon: Archive, tint: 'gray' },
};

/** Icon for an aisle id. Other and any aisle id this app does not know get a basket. */
export function aisleIcon(aisleId: string): LucideIcon {
  return BY_AISLE[aisleId]?.icon ?? ShoppingBasket;
}

/** Badge tint for an aisle id. Other and unknown aisles are grey. */
export function aisleTint(aisleId: string): Tint {
  return BY_AISLE[aisleId]?.tint ?? 'gray';
}

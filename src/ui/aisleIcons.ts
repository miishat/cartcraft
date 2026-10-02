import {
  Archive, Beef, Carrot, Croissant, CupSoda, Droplet, Milk, Package, ShoppingBasket, Snowflake, SprayCan, Wheat,
  type LucideIcon,
} from 'lucide-react';

const BY_AISLE: Record<string, LucideIcon> = {
  produce: Carrot,
  'meat-seafood': Beef,
  'dairy-eggs': Milk,
  bakery: Croissant,
  pantry: Wheat,
  canned: Package,
  'spices-oils': Droplet,
  frozen: Snowflake,
  beverages: CupSoda,
  household: SprayCan,
};

/** Icon for an aisle id. Other and any aisle id this app does not know get a basket. */
export function aisleIcon(aisleId: string): LucideIcon {
  return BY_AISLE[aisleId] ?? ShoppingBasket;
}

/** Icon for the "Check pantry" section. */
export const PANTRY_CHECK_ICON: LucideIcon = Archive;

import { z } from 'zod';
import type { Amount, IngredientLine, ListItem, Quantity } from '../domain';
import type { Aisle, AisleOverride, BackupData, PantryStaple, Recipe, Settings, ShoppingList } from './types';

const text = (max = 2000) => z.string().max(max);
const id = text(200);
const count = z.number().finite().nonnegative();

const QuantitySchema: z.ZodType<Quantity> = z.object({ min: count, max: count.optional() });
const PackageSizeSchema = z.object({ quantity: count, unit: id });

const IngredientLineSchema: z.ZodType<IngredientLine> = z.object({
  id,
  raw: text(),
  quantity: QuantitySchema.optional(),
  unit: id.optional(),
  item: text(),
  itemKey: text(),
  size: z.enum(['small', 'medium', 'large']).optional(),
  packageSize: PackageSizeSchema.optional(),
  notes: text(),
  alternatives: z.array(text()).max(20),
  scalable: z.boolean(),
  approximate: z.boolean(),
  isHeader: z.boolean(),
  needsReview: z.boolean(),
});

const AmountSchema: z.ZodType<Amount> = z.object({
  quantity: QuantitySchema,
  unit: id.optional(),
  packageSize: PackageSizeSchema.optional(),
});

const ListItemSchema: z.ZodType<ListItem> = z.object({
  id,
  itemKey: text(),
  name: text(),
  amounts: z.array(AmountSchema).max(50),
  aisleId: id,
  group: z.enum(['aisle', 'pantry']),
  checked: z.boolean(),
  checkedAt: count.optional(),
  origin: z.enum(['recipe', 'adhoc']),
  fromRecipes: z.array(text(500)).max(100),
  notes: text(),
});

const RecipeSchema: z.ZodType<Recipe> = z.object({
  id,
  title: text(500),
  sourceUrl: text().optional(),
  rawText: text(100_000),
  baseServings: z.number().finite().positive(),
  yieldText: text(500).optional(),
  ingredients: z.array(IngredientLineSchema).max(500),
  steps: z.array(z.object({ text: text(), isHeader: z.boolean() })).max(300).optional(),
  createdAt: count,
  updatedAt: count,
});

const ShoppingListSchema: z.ZodType<ShoppingList> = z.object({
  id,
  name: text(500),
  createdAt: count,
  sources: z.array(z.object({ recipeId: id, title: text(500), targetServings: z.number().finite().positive() })).max(100),
  items: z.array(ListItemSchema).max(2000),
  extras: z
    .object({
      swaps: z.array(z.object({ item: text(500), swap: text() })).max(100),
      tips: z.array(text()).max(100),
      generatedAt: count,
    })
    .optional(),
});

const PantryStapleSchema: z.ZodType<PantryStaple> = z.object({ itemKey: text(200) });
const AisleSchema: z.ZodType<Aisle> = z.object({ id, name: text(200), order: z.number().int() });
const AisleOverrideSchema: z.ZodType<AisleOverride> = z.object({
  itemKey: text(200),
  aisleId: id,
  source: z.enum(['user', 'llm']),
});

/** Unknown keys (including any smuggled-in API key fields) are stripped by z.object. */
const SettingsSchema: z.ZodType<Settings> = z.object({
  id: z.literal('settings'),
  unitSystem: z.enum(['us', 'metric']),
  defaultServings: z.number().finite().positive(),
  llm: z.object({ providerId: id, model: text(200) }),
  keepScreenOn: z.boolean(),
  persistGranted: z.boolean().optional(),
});

export const BackupDataSchema: z.ZodType<BackupData> = z.object({
  recipes: z.array(RecipeSchema).max(5000),
  lists: z.array(ShoppingListSchema).max(5000),
  pantryStaples: z.array(PantryStapleSchema).max(5000),
  aisles: z.array(AisleSchema).max(200),
  aisleOverrides: z.array(AisleOverrideSchema).max(20_000),
  settings: z.array(SettingsSchema).max(1),
});

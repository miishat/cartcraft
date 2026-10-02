import { recipeCover } from '../recipeCover';
import { TINT_CLASS } from '../tints';

const SIZE = { md: 'h-11 w-11 rounded-xl text-2xl', lg: 'h-16 w-16 rounded-2xl text-4xl' } as const;

/** Emoji cover on a tinted square. Decorative: the title is always next to it. */
export function RecipeCover({ recipe, size = 'md' }: { recipe: { id: string; title: string }; size?: 'md' | 'lg' }) {
  const { emoji, tint } = recipeCover(recipe);
  return (
    <span aria-hidden="true" data-recipe-cover className={`flex shrink-0 items-center justify-center ${SIZE[size]} ${TINT_CLASS[tint]}`}>
      {emoji}
    </span>
  );
}

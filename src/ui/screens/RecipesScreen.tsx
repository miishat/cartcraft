import { useLiveQuery } from 'dexie-react-hooks';
import { Check, Plus, ShoppingBasket } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { newId } from '../../app/ids';
import { createList } from '../../app/lists';
import { ErrorNote } from '../components/ErrorNote';
import { RecipeCover } from '../components/RecipeCover';
import { ServingsStepper } from '../components/ServingsStepper';
import { useDb } from '../db';
import { useSettings } from '../hooks';
import { useAsyncAction } from '../useAsyncAction';

interface Props {
  makeId?: () => string;
  now?: () => number;
}

/** Search recipes, select some with per-recipe target servings, and build a list. */
export function RecipesScreen({ makeId = newId, now = Date.now }: Props) {
  const db = useDb();
  const navigate = useNavigate();
  const settings = useSettings();
  const recipes = useLiveQuery(() => db.recipes.orderBy('title').toArray(), [db]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Map<string, number>>(new Map());
  const build = useAsyncAction(async () => {
    const listId = await createList(
      db,
      [...selected].map(([recipeId, targetServings]) => ({ recipeId, targetServings })),
      now(),
      makeId,
    );
    navigate(`/lists/${listId}`);
  }, 'Could not build the list. Try again.');

  if (!recipes) return null;

  const visible = recipes.filter((r) => r.title.toLowerCase().includes(query.trim().toLowerCase()));

  const ingredientCount = recipes
    .filter((r) => selected.has(r.id))
    .reduce((n, r) => n + r.ingredients.filter((l) => !l.isHeader).length, 0);
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else next.set(id, settings.defaultServings);
      return next;
    });
  };

  const setServings = (id: string, servings: number) => {
    setSelected((prev) => new Map(prev).set(id, servings));
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-36">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-slate-900">Recipes</h1>
          {recipes.length > 0 && <p className="text-sm text-slate-500">Pick recipes for your next list</p>}
        </div>
        <Link to="/recipes/new" className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-white px-3 py-2 text-sm font-medium text-slate-800 ring-1 ring-slate-200">
          <Plus size={16} /> Add recipe
        </Link>
      </div>

      {recipes.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
          No recipes yet. Add one to start building shopping lists.
        </p>
      ) : (
        <>
          <input
            type="search"
            className="w-full rounded-xl px-4 py-2.5 ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-emerald-600"
            placeholder="Search recipes"
            aria-label="Search recipes"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
            {visible.map((recipe) => {
              const isSelected = selected.has(recipe.id);
              return (
                <li key={recipe.id} className={`flex items-center gap-3 px-3 py-3 ${isSelected ? 'bg-emerald-50' : ''}`}>
                  <Link to={`/recipes/${recipe.id}/view`} aria-label={`View ${recipe.title}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <RecipeCover recipe={recipe} />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-slate-900">{recipe.title}</span>
                      <span className="block text-xs text-slate-500">
                        {plural(recipe.ingredients.filter((l) => !l.isHeader).length, 'ingredient')} · serves {recipe.baseServings}
                      </span>
                    </span>
                  </Link>
                  {isSelected && (
                    <ServingsStepper
                      value={selected.get(recipe.id) ?? settings.defaultServings}
                      onChange={(n) => setServings(recipe.id, n)}
                      label={recipe.title}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => toggle(recipe.id)}
                    aria-pressed={isSelected}
                    aria-label={`Select ${recipe.title}`}
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${isSelected ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300'}`}
                  >
                    {isSelected && <Check size={16} aria-hidden="true" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 flex flex-col items-center gap-2 px-4 pb-3 md:bottom-0 md:pb-6">
          <ErrorNote message={build.error} className="rounded-lg bg-red-50 px-3 py-2 shadow" />
          <button
            type="button"
            onClick={() => void build.run()}
            disabled={build.pending}
            aria-label={`Build list (${selected.size})`}
            className="mx-auto flex w-full max-w-2xl items-center gap-3 rounded-2xl bg-slate-900 px-4 py-3.5 font-semibold text-white shadow-lg disabled:opacity-50"
          >
            <ShoppingBasket size={18} aria-hidden="true" /> Build list
            <span className="ml-auto text-sm font-normal text-slate-300">
              {plural(selected.size, 'recipe')} · {plural(ingredientCount, 'ingredient')}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

import { useLiveQuery } from 'dexie-react-hooks';
import { CheckCircle2, Circle, Plus, ShoppingCart } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { newId } from '../../app/ids';
import { createList } from '../../app/lists';
import { ServingsStepper } from '../components/ServingsStepper';
import { useDb } from '../db';
import { useSettings } from '../hooks';

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
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);

  if (!recipes) return null;

  const visible = recipes.filter((r) => r.title.toLowerCase().includes(query.trim().toLowerCase()));

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

  const build = async () => {
    setBuilding(true);
    setBuildError(null);
    try {
      const listId = await createList(
        db,
        [...selected].map(([recipeId, targetServings]) => ({ recipeId, targetServings })),
        now(),
        makeId,
      );
      navigate(`/lists/${listId}`);
    } catch {
      setBuildError('Could not build the list. Try again.');
    } finally {
      setBuilding(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-28">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Recipes</h1>
        <Link to="/recipes/new" className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white">
          <Plus size={16} /> Add recipe
        </Link>
      </div>

      {recipes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
          No recipes yet. Add one to start building shopping lists.
        </p>
      ) : (
        <>
          <input
            type="search"
            className="w-full rounded-lg border border-slate-200 px-3 py-2"
            placeholder="Search recipes"
            aria-label="Search recipes"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <ul className="space-y-2">
            {visible.map((recipe) => {
              const isSelected = selected.has(recipe.id);
              return (
                <li key={recipe.id} className={`rounded-xl border p-3 ${isSelected ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => toggle(recipe.id)}
                      aria-pressed={isSelected}
                      aria-label={`Select ${recipe.title}`}
                      className="shrink-0"
                    >
                      {isSelected ? <CheckCircle2 className="text-emerald-700" /> : <Circle className="text-slate-300" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-900">{recipe.title}</p>
                      <p className="text-xs text-slate-500">
                        {recipe.ingredients.length} ingredients · serves {recipe.baseServings}
                      </p>
                    </div>
                    <Link to={`/recipes/${recipe.id}`} className="text-sm font-medium text-slate-600" aria-label={`Edit ${recipe.title}`}>
                      Edit
                    </Link>
                  </div>
                  {isSelected && (
                    <div className="mt-2 flex items-center gap-2 pl-9 text-sm text-slate-600">
                      Make for
                      <ServingsStepper
                        value={selected.get(recipe.id) ?? settings.defaultServings}
                        onChange={(n) => setServings(recipe.id, n)}
                        label={recipe.title}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-20 flex flex-col items-center gap-2 px-4 md:bottom-6">
          {buildError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 shadow">{buildError}</p>}
          <button
            type="button"
            onClick={() => void build()}
            disabled={building}
            className="inline-flex items-center gap-2 rounded-full bg-emerald-800 px-6 py-3 font-medium text-white shadow-lg disabled:opacity-50"
          >
            <ShoppingCart size={18} /> Build list ({selected.size})
          </button>
        </div>
      )}
    </div>
  );
}

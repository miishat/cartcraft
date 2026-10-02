import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Pencil } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { formatAmount, scaleLine, type IngredientLine, type UnitSystem } from '../../domain';
import { ServingsStepper } from '../components/ServingsStepper';
import { useDb } from '../db';
import { useSettings } from '../hooks';

/** The ingredient as it reads on a recipe card: amount, then the item and any notes. */
function lineText(line: IngredientLine, system: UnitSystem): string {
  if (!line.quantity) return line.raw;
  const amount = formatAmount(
    { quantity: line.quantity, ...(line.unit ? { unit: line.unit } : {}), ...(line.packageSize ? { packageSize: line.packageSize } : {}) },
    system,
  );
  if (!amount || !line.item) return line.raw;
  return `${amount} ${line.item}${line.notes ? `, ${line.notes}` : ''}`;
}

/** Read-only recipe page (/recipes/:id/view) with a servings stepper that scales what is shown. */
export function RecipeViewScreen() {
  const { id = '' } = useParams();
  const db = useDb();
  const settings = useSettings();
  const recipe = useLiveQuery(async () => (await db.recipes.get(id)) ?? null, [db, id]);
  const [servings, setServings] = useState<number | null>(null);

  if (recipe === undefined) return null;
  if (recipe === null) {
    return (
      <div className="mx-auto max-w-2xl space-y-3">
        <p className="text-slate-500">Recipe not found.</p>
        <Link to="/" className="text-sm font-medium text-emerald-800">Back to recipes</Link>
      </div>
    );
  }

  const target = servings ?? recipe.baseServings;
  const lines = recipe.ingredients.map((line) => scaleLine(line, recipe.baseServings, target));

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link to="/" className="inline-flex items-center gap-1 text-sm font-medium text-slate-600">
        <ArrowLeft size={16} /> Recipes
      </Link>
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">{recipe.title}</h1>
        <Link
          to={`/recipes/${recipe.id}`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          <Pencil size={14} /> Edit
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
        Serves
        <ServingsStepper value={target} onChange={setServings} label={recipe.title} />
        {target !== recipe.baseServings && (
          <span className="text-xs text-slate-500">Written for {recipe.baseServings}</span>
        )}
      </div>

      <section aria-label="Ingredients" className="space-y-2">
        <h2 className="text-sm font-medium text-slate-700">Ingredients</h2>
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {lines.map((line) =>
            line.isHeader ? (
              <li key={line.id} className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{line.raw}</li>
            ) : (
              <li key={line.id} className="px-3 py-2 text-slate-800">{lineText(line, settings.unitSystem)}</li>
            ),
          )}
        </ul>
      </section>

      {recipe.sourceUrl && (
        <p className="truncate text-sm text-slate-500">
          Source:{' '}
          {/^https?:\/\//i.test(recipe.sourceUrl) ? (
            <a href={recipe.sourceUrl} target="_blank" rel="noreferrer noopener" className="underline">{recipe.sourceUrl}</a>
          ) : (
            recipe.sourceUrl
          )}
        </p>
      )}
    </div>
  );
}

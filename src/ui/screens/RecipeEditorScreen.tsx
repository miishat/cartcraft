import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { IngredientLine } from '../../domain';
import { newId } from '../../app/ids';
import { deleteRecipe, draftLinesFromText, requestPersistence, saveRecipe } from '../../app/recipes';
import { ErrorNote } from '../components/ErrorNote';
import { ReviewTable } from '../components/ReviewTable';
import { useDb } from '../db';
import { useSettings } from '../hooks';
import { useAsyncAction } from '../useAsyncAction';

interface Props {
  makeId?: () => string;
  now?: () => number;
}

/** Add (/recipes/new) or edit (/recipes/:id). Paste text, review parsed lines, set servings, save. */
export function RecipeEditorScreen({ makeId = newId, now = Date.now }: Props) {
  const { id } = useParams();
  const db = useDb();
  const navigate = useNavigate();
  const settings = useSettings();

  const [loaded, setLoaded] = useState(id === undefined);
  const [missing, setMissing] = useState(false);
  const [rawText, setRawText] = useState('');
  const [title, setTitle] = useState('');
  const [servings, setServings] = useState<string>('');
  const [lines, setLines] = useState<IngredientLine[] | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | undefined>();
  const [yieldText, setYieldText] = useState<string | undefined>();

  useEffect(() => {
    if (id === undefined) return;
    void db.recipes.get(id).then((recipe) => {
      if (recipe) {
        setTitle(recipe.title);
        setRawText(recipe.rawText);
        setServings(String(recipe.baseServings));
        setLines(recipe.ingredients);
        setSourceUrl(recipe.sourceUrl);
        setYieldText(recipe.yieldText);
      } else {
        setMissing(true);
      }
      setLoaded(true);
    });
  }, [db, id]);

  const parse = () => {
    setLines(draftLinesFromText(rawText, makeId));
    if (!servings) setServings(String(settings.defaultServings));
  };

  const baseServings = Number(servings);
  const canSave = lines !== null && title.trim() !== '' && Number.isFinite(baseServings) && baseServings > 0;

  const save = useAsyncAction(async (ingredients: IngredientLine[]) => {
    const isFirst = (await db.recipes.count()) === 0;
    await saveRecipe(
      db,
      {
        ...(id ? { id } : {}),
        title,
        rawText,
        baseServings,
        ingredients: ingredients.filter((l) => l.raw.trim() !== ''),
        ...(sourceUrl ? { sourceUrl } : {}),
        ...(yieldText ? { yieldText } : {}),
      },
      now(),
      makeId,
    );
    if (isFirst) void requestPersistence(db);
    navigate('/');
  }, 'Could not save the recipe. Try again.');

  const remove = useAsyncAction(async (recipeId: string) => {
    await deleteRecipe(db, recipeId);
    navigate('/');
  }, 'Could not delete the recipe. Try again.');

  const onSave = (e: FormEvent) => {
    e.preventDefault();
    if (canSave && lines) void save.run(lines);
  };

  const onDelete = () => {
    if (id && window.confirm(`Delete "${title}"?`)) void remove.run(id);
  };

  if (!loaded) return null;
  if (missing) {
    return (
      <div className="mx-auto max-w-2xl space-y-3">
        <p className="text-slate-500">Recipe not found.</p>
        <Link to="/" className="text-sm font-medium text-emerald-800">Back to recipes</Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSave} className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">{id ? 'Edit recipe' : 'Add recipe'}</h1>

      <section className="space-y-2">
        <label htmlFor="raw" className="block text-sm font-medium text-slate-700">Ingredients</label>
        <textarea
          id="raw"
          className="h-40 w-full rounded-xl border border-slate-200 p-3 font-mono text-sm"
          placeholder={'2 cups flour\n3 eggs\nSalt, to taste'}
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
        />
        <button
          type="button"
          onClick={parse}
          disabled={!rawText.trim()}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {lines ? 'Parse again' : 'Parse ingredients'}
        </button>
      </section>

      {lines && (
        <>
          <section className="grid gap-4 sm:grid-cols-[1fr_10rem]">
            <label className="block text-sm font-medium text-slate-700">
              Title
              <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Base servings
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                type="number"
                min={1}
                inputMode="numeric"
                value={servings}
                onChange={(e) => setServings(e.target.value)}
              />
            </label>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-medium text-slate-700">Review ({lines.length} lines)</h2>
            <ReviewTable lines={lines} onChange={setLines} unitSystem={settings.unitSystem} makeId={makeId} />
          </section>

          <ErrorNote message={save.error ?? remove.error} />

          <div className="flex items-center gap-3">
            <button type="submit" disabled={!canSave || save.pending} className="rounded-lg bg-emerald-800 px-5 py-2.5 font-medium text-white disabled:opacity-40">
              Save recipe
            </button>
            {id && (
              <button type="button" onClick={onDelete} disabled={remove.pending} className="text-sm font-medium text-red-700">
                Delete
              </button>
            )}
          </div>
        </>
      )}
    </form>
  );
}

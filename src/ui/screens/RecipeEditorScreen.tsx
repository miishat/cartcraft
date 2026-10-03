import { useLiveQuery } from 'dexie-react-hooks';
import { Link2, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { IngredientLine, RecipeStep } from '../../domain';
import { aiCleanUpText, hasUsableAiKey, type AiDraft } from '../../app/ai';
import { newId } from '../../app/ids';
import { deleteRecipe, draftLinesFromText, requestPersistence, saveRecipe } from '../../app/recipes';
import {
  IMPORT_MESSAGES, fetchPageText, importRecipeFromUrl, looksLikeUrl, type PageTextResult, type UrlImportResult,
} from '../../services/urlImport';
import { ConfirmDialog } from '../components/Dialog';
import { ErrorNote } from '../components/ErrorNote';
import { ScreenHeader } from '../components/ScreenHeader';
import { ReviewTable } from '../components/ReviewTable';
import { useDb } from '../db';
import { useSettings } from '../hooks';
import { useAsyncAction } from '../useAsyncAction';

interface Props {
  makeId?: () => string;
  now?: () => number;
  importRecipe?: (url: string) => Promise<UrlImportResult>;
  fetchText?: (url: string) => Promise<PageTextResult>;
  /** Defaults to aiCleanUpText with this screen's db and makeId. */
  cleanUp?: (text: string) => Promise<AiDraft>;
}

/**
 * Add (/recipes/new) or edit (/recipes/:id). Paste ingredients or a recipe link, review the
 * parsed lines, set servings, save. A link that cannot be imported switches to paste mode;
 * with an AI key, messy text and pages without recipe data can be cleaned up by AI.
 */
export function RecipeEditorScreen({
  makeId = newId,
  now = Date.now,
  importRecipe = importRecipeFromUrl,
  fetchText = fetchPageText,
  cleanUp,
}: Props) {
  const { id } = useParams();
  const db = useDb();
  const navigate = useNavigate();
  const settings = useSettings();
  const hasAi = useLiveQuery(() => hasUsableAiKey(db), [db]) ?? false;
  const runCleanUp = cleanUp ?? ((text: string) => aiCleanUpText(db, text, makeId));

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [loaded, setLoaded] = useState(id === undefined);
  const [missing, setMissing] = useState(false);
  const [rawText, setRawText] = useState('');
  const [title, setTitle] = useState('');
  const [servings, setServings] = useState<string>('');
  const [servingsGuessed, setServingsGuessed] = useState(false);
  const [lines, setLines] = useState<IngredientLine[] | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | undefined>();
  const [yieldText, setYieldText] = useState<string | undefined>();
  const [steps, setSteps] = useState<RecipeStep[] | undefined>();
  const [importNote, setImportNote] = useState<string | null>(null);
  /** A link whose page had no recipe data; AI can still read its text. */
  const [aiUrl, setAiUrl] = useState<string | null>(null);

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
        setSteps(recipe.steps);
      } else {
        setMissing(true);
      }
      setLoaded(true);
    });
  }, [db, id]);

  const isLink = looksLikeUrl(rawText);

  const parse = () => {
    setImportNote(null);
    setAiUrl(null);
    importLink.clearError();
    cleanUpText.clearError();
    tryWithAi.clearError();
    setLines(draftLinesFromText(rawText, makeId));
    if (!servings) setServings(String(settings.defaultServings));
  };

  const applyAiDraft = (draft: AiDraft, text: string) => {
    setTitle((current) => current || draft.title);
    // The AI never overwrites servings the user already has; when it supplies them, ask for a check.
    if (!servings.trim()) {
      setServings(String(draft.servings ?? settings.defaultServings));
      setServingsGuessed(true);
    }
    setRawText(text);
    setLines(draft.lines);
  };

  const cleanUpText = useAsyncAction(async (text: string) => {
    setImportNote(null);
    setAiUrl(null);
    importLink.clearError();
    tryWithAi.clearError();
    applyAiDraft(await runCleanUp(text), text);
  }, 'AI clean-up failed. Use Parse ingredients instead.');

  const tryWithAi = useAsyncAction(async (url: string) => {
    setImportNote(null);
    importLink.clearError();
    cleanUpText.clearError();
    const page = await fetchText(url);
    if (!page.ok) {
      setImportNote(IMPORT_MESSAGES[page.error].message);
      return;
    }
    const draft = await runCleanUp(page.text);
    setSourceUrl(page.sourceUrl);
    setSteps(undefined);
    setAiUrl(null);
    applyAiDraft(draft, draft.lines.map((l) => l.raw).join('\n'));
  }, 'AI could not read that page. Copy the ingredient list and paste it here.');

  const importLink = useAsyncAction(async (url: string) => {
    setImportNote(null);
    setAiUrl(null);
    cleanUpText.clearError();
    tryWithAi.clearError();
    const result = await importRecipe(url);
    if (!result.ok) {
      const { message, pasteInstead } = IMPORT_MESSAGES[result.error];
      setImportNote(message);
      if (result.error === 'no_recipe_data') setAiUrl(url.trim());
      if (pasteInstead) {
        setSourceUrl(url.trim());
        setSteps(undefined);
        setRawText('');
      }
      return;
    }
    const { recipe } = result;
    const text = recipe.ingredients.join('\n');
    setTitle((current) => current || recipe.title);
    setSourceUrl(recipe.sourceUrl);
    setYieldText(recipe.yieldText);
    setSteps(recipe.steps);
    setServings(String(recipe.servings ?? settings.defaultServings));
    setServingsGuessed(recipe.servings === undefined);
    setRawText(text);
    setLines(draftLinesFromText(text, makeId));
  }, 'Could not import that link. Paste the ingredients instead.');

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
        ...(steps ? { steps } : {}),
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
      <ScreenHeader
        title={id ? 'Edit recipe' : 'Add recipe'}
        back={id ? { to: `/recipes/${id}/view`, label: 'Recipe' } : { to: '/', label: 'Recipes' }}
      />

      <section className="space-y-2">
        <label htmlFor="raw" className="block text-sm font-medium text-slate-700">Ingredients</label>
        <p className="text-xs text-slate-500">Paste the ingredient list, or a link to a recipe page.</p>
        <textarea
          id="raw"
          className="h-40 w-full rounded-xl border border-slate-200 p-3 font-mono text-sm"
          placeholder={'https://www.example.com/recipes/tacos\n\nor\n\n2 cups flour\n3 eggs\nSalt, to taste'}
          value={rawText}
          onChange={(e) => {
            setRawText(e.target.value);
            setAiUrl(null);
          }}
        />
        {isLink ? (
          <button
            type="button"
            onClick={() => void importLink.run(rawText)}
            disabled={importLink.pending}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            <Link2 size={16} /> {importLink.pending ? 'Importing...' : 'Import from link'}
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={parse}
              disabled={!rawText.trim()}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {lines ? 'Parse again' : 'Parse ingredients'}
            </button>
            <button
              type="button"
              onClick={() => void cleanUpText.run(rawText)}
              disabled={!hasAi || !rawText.trim() || cleanUpText.pending}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium disabled:opacity-40"
            >
              <Sparkles size={16} /> {cleanUpText.pending ? 'Cleaning up...' : 'Clean up with AI'}
            </button>
            {!hasAi && (
              <span className="text-xs text-slate-500">
                <Link to="/settings/ai" className="underline">Add an AI key in Settings</Link> to use AI clean-up.
              </span>
            )}
          </div>
        )}
        <ErrorNote message={importNote ?? importLink.error ?? cleanUpText.error ?? tryWithAi.error} />
        {aiUrl && hasAi && (
          <button
            type="button"
            onClick={() => void tryWithAi.run(aiUrl)}
            disabled={tryWithAi.pending}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium disabled:opacity-40"
          >
            <Sparkles size={16} /> {tryWithAi.pending ? 'Reading the page...' : 'Try with AI'}
          </button>
        )}
        {sourceUrl && (
          <p className="truncate text-xs text-slate-500">
            Source:{' '}
            {/^https?:\/\//i.test(sourceUrl) ? (
              <a href={sourceUrl} target="_blank" rel="noreferrer noopener" className="underline">{sourceUrl}</a>
            ) : (
              sourceUrl
            )}
          </p>
        )}
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
                onChange={(e) => {
                  setServings(e.target.value);
                  setServingsGuessed(false);
                }}
              />
            </label>
          </section>
          {servingsGuessed && (
            <p role="status" className="text-sm text-amber-800">
              The page did not say how many servings it makes{yieldText ? ` (it says "${yieldText}")` : ''}. Check base servings.
            </p>
          )}

          <section className="space-y-2">
            <h2 className="text-sm font-medium text-slate-700">Review ({lines.length} lines)</h2>
            <ReviewTable lines={lines} onChange={setLines} unitSystem={settings.unitSystem} makeId={makeId} />
          </section>

          <ErrorNote message={save.error ?? remove.error} />

          <div className="flex items-center gap-3">
            <button type="submit" disabled={!canSave || save.pending} className="rounded-lg bg-emerald-800 px-5 py-2.5 font-medium text-white disabled:opacity-40">
              Save
            </button>
            {id && (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                disabled={remove.pending}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-40"
              >
                <Trash2 size={16} /> Delete
              </button>
            )}
          </div>
        </>
      )}

      {confirmingDelete && id && (
        <ConfirmDialog
          title={`Delete "${title}"?`}
          message="This recipe will be removed. Lists you already built from it are not affected."
          confirmLabel="Delete recipe"
          danger
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={() => {
            setConfirmingDelete(false);
            void remove.run(id);
          }}
        />
      )}
    </form>
  );
}

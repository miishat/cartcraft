import { useLiveQuery } from 'dexie-react-hooks';
import { Copy, Pencil, Plus, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import type { ListItem } from '../../domain';
import { aiSortUnknownItems, aiSwapsAndTips, hasUsableAiKey } from '../../app/ai';
import { newId } from '../../app/ids';
import {
  addAdhocItem, deleteItem, editItem, moveItemToAisle, renameList, setItemChecked,
} from '../../app/lists';
import { groupListItems, listAsText } from '../../app/listView';
import { updateSettings } from '../../data/db';
import { PANTRY_CHECK_ID } from '../aisleIcons';
import { AisleBadge } from '../components/AisleBadge';
import { ErrorNote } from '../components/ErrorNote';
import { PromptDialog } from '../components/Dialog';
import { ProgressBar } from '../components/ProgressBar';
import { ListItemRow } from '../components/ListItemRow';
import { useDb } from '../db';
import { useAisles, useSettings } from '../hooks';
import { useAsyncAction } from '../useAsyncAction';
import { useWakeLock, wakeLockSupported } from '../useWakeLock';

const CARD = 'overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200';
const CARD_HEADING = 'flex items-center gap-2.5 px-3 pb-1 pt-3 text-sm font-semibold text-slate-900';
const pill = (on: boolean) =>
  `inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold ${on ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`;

interface Props {
  makeId?: () => string;
  now?: () => number;
  undoMs?: number;
  copiedMs?: number;
  /** Override the HTTP client for AI calls (tests). */
  fetchImpl?: (input: string, init: RequestInit) => Promise<Response>;
}

/** Shopping mode for one saved list. */
export function ListScreen({ makeId = newId, now = Date.now, undoMs = 5000, copiedMs = 3000, fetchImpl }: Props) {
  const { id = '' } = useParams();
  const db = useDb();
  const settings = useSettings();
  const aisles = useAisles();
  const list = useLiveQuery(async () => (await db.lists.get(id)) ?? null, [db, id]);
  const hasAi = useLiveQuery(() => hasUsableAiKey(db), [db]) ?? false;
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [adhoc, setAdhoc] = useState('');
  const [undo, setUndo] = useState<ListItem | null>(null);
  const [copied, setCopied] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [aisleFilter, setAisleFilter] = useState<string | null>(null);
  const [canWakeLock] = useState(wakeLockSupported);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useWakeLock(settings.keepScreenOn);

  useEffect(
    () => () => {
      clearTimeout(undoTimer.current);
      clearTimeout(copiedTimer.current);
    },
    [],
  );

  /** Runs any list change; a failure shows one inline message instead of an unhandled rejection. */
  const act = useAsyncAction((fn: () => Promise<void>) => {
    copy.clearError();
    return fn();
  }, 'That change did not save. Try again.');
  const copy = useAsyncAction(async (text: string) => {
    act.clearError();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), copiedMs);
  }, 'Could not copy. Select the list and copy it manually.');

  const sortAction = useAsyncAction(async () => {
    extrasAction.clearError();
    setAiNote(null);
    const moved = await aiSortUnknownItems(db, id, fetchImpl);
    setAiNote(moved === 0 ? 'AI could not place any of those items. Move them yourself from the item menu.' : `Moved ${moved} ${moved === 1 ? 'item' : 'items'} into aisles.`);
  }, 'AI sorting failed. Move items yourself from the item menu.');

  const extrasAction = useAsyncAction(async () => {
    sortAction.clearError();
    setAiNote(null);
    await aiSwapsAndTips(db, id, now(), fetchImpl);
  }, 'Could not get swaps and tips. Try again.');

  if (list === undefined || aisles === undefined) return null;
  if (list === null) return <p className="text-slate-500">List not found.</p>;

  const view = groupListItems(list.items, aisles);
  // The filter only applies while the bar is visible (more than one aisle) and its aisle still has items; otherwise show everything.
  const filtered = view.aisles.length > 1 && aisleFilter !== null &&view.aisles.some((s) => s.id === aisleFilter);
  const shownAisles = filtered ? view.aisles.filter((s) => s.id === aisleFilter) : view.aisles;
  const leftCount = view.aisles.reduce((n, s) => n + s.items.length, 0);
  const unknownCount = new Set(list.items.filter((i) => !i.checked && i.group === 'aisle' && i.aisleId === 'other').map((i) => i.itemKey)).size;

  const toggle = (item: ListItem) =>
    act.run(async () => {
      const checking = !item.checked;
      await setItemChecked(db, list.id, item.id, checking, now());
      clearTimeout(undoTimer.current);
      if (checking) {
        setUndo(item);
        undoTimer.current = setTimeout(() => setUndo(null), undoMs);
      } else {
        setUndo(null);
      }
    });

  const undoCheck = () =>
    act.run(async () => {
      if (!undo) return;
      await setItemChecked(db, list.id, undo.id, false, now());
      setUndo(null);
    });

  const onAdd = (e: FormEvent) => {
    e.preventDefault();
    if (!adhoc.trim()) return;
    void act.run(async () => {
      await addAdhocItem(db, list.id, adhoc, makeId);
      setAdhoc('');
    });
  };

  const row = (item: ListItem) => (
    <ListItemRow
      key={item.id}
      item={item}
      aisles={aisles}
      unitSystem={settings.unitSystem}
      onToggle={() => void toggle(item)}
      onEdit={(text) => void act.run(() => editItem(db, list.id, item.id, text))}
      onDelete={() => void act.run(() => deleteItem(db, list.id, item.id))}
      onMove={(aisleId) => void act.run(() => moveItemToAisle(db, list.id, item.id, aisleId))}
    />
  );

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-40">
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[28px] font-bold leading-tight tracking-tight text-slate-900">{list.name}</h1>
            <p className="text-sm text-slate-500">From {list.sources.map((s) => `${s.title} (${s.targetServings})`).join(', ')}</p>
          </div>
          <div className="flex shrink-0 gap-1">
            <button type="button" onClick={() => setRenaming(true)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Rename list">
              <Pencil size={18} />
            </button>
            <button
              type="button"
              onClick={() => void copy.run(listAsText(list.name, list.items, aisles, settings.unitSystem))}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              aria-label="Copy list as text"
            >
              <Copy size={18} />
            </button>
          </div>
        </div>
        <ProgressBar done={list.items.filter((i) => i.checked).length} total={list.items.length} />
      </div>
      {canWakeLock && (
        <label className="flex w-fit items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={settings.keepScreenOn}
            onChange={(e) => void act.run(() => updateSettings(db, { keepScreenOn: e.target.checked }))}
          />
          Keep screen on
        </label>
      )}
      {copied && <p role="status" className="text-sm text-emerald-700">Copied to clipboard</p>}
      <ErrorNote message={act.error ?? copy.error} />

      <form onSubmit={onAdd} className="flex gap-2">
        <input
          className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2"
          placeholder="Add an item, e.g. paper towels"
          aria-label="Add an item"
          value={adhoc}
          onChange={(e) => setAdhoc(e.target.value)}
        />
        <button type="submit" className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-white" aria-label="Add item">
          <Plus size={18} />
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {unknownCount > 0 && (
          <button
            type="button"
            onClick={() => void sortAction.run()}
            disabled={!hasAi || sortAction.pending}
            className="inline-flex items-center gap-1 rounded-xl bg-white px-3 py-1.5 ring-1 ring-slate-200 disabled:opacity-40"
          >
            <Sparkles size={14} /> {sortAction.pending ? 'Sorting...' : `Sort ${unknownCount} unknown ${unknownCount === 1 ? 'item' : 'items'} with AI`}
          </button>
        )}
        <button
          type="button"
          onClick={() => void extrasAction.run()}
          disabled={!hasAi || extrasAction.pending || list.items.length === 0}
          className="inline-flex items-center gap-1 rounded-xl bg-white px-3 py-1.5 ring-1 ring-slate-200 disabled:opacity-40"
        >
          <Sparkles size={14} /> {extrasAction.pending ? 'Thinking...' : list.extras ? 'Refresh swaps & tips' : 'Add swaps & tips'}
        </button>
        {!hasAi && (
          <span className="text-xs text-slate-500">
            <Link to="/settings" className="underline">Add an AI key in Settings</Link> to use these.
          </span>
        )}
      </div>
      <ErrorNote message={sortAction.error ?? extrasAction.error} />
      {aiNote && <p role="status" className="text-sm text-slate-700">{aiNote}</p>}

      {view.aisles.length > 1 && (
        <div role="group" aria-label="Filter by aisle" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          <button type="button" aria-pressed={!filtered} aria-label="Show all aisles" onClick={() => setAisleFilter(null)} className={pill(!filtered)}>
            All <span className="tabular-nums">{leftCount}</span>
          </button>
          {view.aisles.map((section) => {
            const on = filtered && aisleFilter === section.id;
            return (
              <button
                key={section.id}
                type="button"
                aria-pressed={on}
                aria-label={`Show only ${section.title}`}
                onClick={() => setAisleFilter(section.id)}
                className={pill(on)}
              >
                <AisleBadge aisleId={section.id} size="sm" /> {section.title} <span className="tabular-nums">{section.items.length}</span>
              </button>
            );
          })}
        </div>
      )}

      {shownAisles.map((section) => (
        <section key={section.id} aria-label={section.title} className={CARD}>
          <h2 className={CARD_HEADING}>
            <AisleBadge aisleId={section.id} /> {section.title}
            <span className="ml-auto text-xs font-normal text-slate-400">{section.items.length} left</span>
          </h2>
          <ul className="divide-y divide-slate-100">{section.items.map(row)}</ul>
        </section>
      ))}

      {!filtered && view.pantry.length > 0 && (
        <section aria-label="Check pantry" className="overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-white">
          <h2 className={CARD_HEADING}>
            <AisleBadge aisleId={PANTRY_CHECK_ID} /> Check pantry
            <span className="ml-auto text-xs font-normal text-slate-400">Have it already?</span>
          </h2>
          <ul className="divide-y divide-slate-100">{view.pantry.map(row)}</ul>
        </section>
      )}

      {!filtered && list.extras && (list.extras.swaps.length > 0 || list.extras.tips.length > 0) && (
        <section aria-label="Swaps & tips" className="space-y-2 rounded-2xl bg-linear-to-br from-tint-purple-bg to-tint-amber-bg p-4 text-sm text-slate-700">
          <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-tint-purple-fg">
            <Sparkles size={14} aria-hidden="true" /> Swaps & tips (AI suggestions)
          </h2>
          {list.extras.swaps.length > 0 && (
            <ul className="space-y-1">
              {list.extras.swaps.map((s, i) => (
                <li key={i}>
                  <span className="font-medium">{s.item}</span>: {s.swap}
                </li>
              ))}
            </ul>
          )}
          {list.extras.tips.length > 0 && (
            <ul className="list-disc space-y-1 pl-5">
              {list.extras.tips.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
          )}
        </section>
      )}

      {view.inCart.length > 0 && (
        <details className={CARD} aria-label="In cart">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-600">In cart ({view.inCart.length})</summary>
          <ul className="divide-y divide-slate-100">{view.inCart.map(row)}</ul>
        </details>
      )}

      {renaming && (
        <PromptDialog
          title="Rename list"
          label="List name"
          initialValue={list.name}
          confirmLabel="Save"
          onCancel={() => setRenaming(false)}
          onSubmit={(name) => {
            setRenaming(false);
            void act.run(() => renameList(db, list.id, name));
          }}
        />
      )}

      {undo && (
        <div role="status" className="fixed inset-x-0 bottom-20 mx-auto flex w-fit items-center gap-4 rounded-full bg-slate-900 px-4 py-2 text-sm text-white shadow-lg md:bottom-6">
          Checked {undo.name}
          <button type="button" onClick={() => void undoCheck()} className="font-semibold text-emerald-300">Undo</button>
        </div>
      )}
    </div>
  );
}

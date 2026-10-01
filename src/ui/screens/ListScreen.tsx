import { useLiveQuery } from 'dexie-react-hooks';
import { Copy, Pencil, Plus } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useParams } from 'react-router';
import type { ListItem } from '../../domain';
import { newId } from '../../app/ids';
import {
  addAdhocItem, deleteItem, editItem, moveItemToAisle, renameList, setItemChecked,
} from '../../app/lists';
import { groupListItems, listAsText } from '../../app/listView';
import { ListItemRow } from '../components/ListItemRow';
import { useDb } from '../db';
import { useAisles, useSettings } from '../hooks';

interface Props {
  makeId?: () => string;
  now?: () => number;
  undoMs?: number;
}

/** Shopping mode for one saved list. */
export function ListScreen({ makeId = newId, now = Date.now, undoMs = 5000 }: Props) {
  const { id = '' } = useParams();
  const db = useDb();
  const settings = useSettings();
  const aisles = useAisles();
  const list = useLiveQuery(() => db.lists.get(id), [db, id]);
  const [adhoc, setAdhoc] = useState('');
  const [undo, setUndo] = useState<ListItem | null>(null);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  if (list === undefined || aisles === undefined) return null;
  if (list === null) return <p className="text-slate-500">List not found.</p>;

  const view = groupListItems(list.items, aisles);

  const toggle = async (item: ListItem) => {
    const checking = !item.checked;
    await setItemChecked(db, list.id, item.id, checking, now());
    clearTimeout(timer.current);
    if (checking) {
      setUndo(item);
      timer.current = setTimeout(() => setUndo(null), undoMs);
    } else {
      setUndo(null);
    }
  };

  const undoCheck = async () => {
    if (!undo) return;
    await setItemChecked(db, list.id, undo.id, false, now());
    setUndo(null);
  };

  const onAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!adhoc.trim()) return;
    await addAdhocItem(db, list.id, adhoc, makeId);
    setAdhoc('');
  };

  const onRename = async () => {
    const name = window.prompt('List name', list.name);
    if (name?.trim()) await renameList(db, list.id, name);
  };

  const onCopy = async () => {
    await navigator.clipboard.writeText(listAsText(list.name, list.items, aisles, settings.unitSystem));
    setCopied(true);
  };

  const row = (item: ListItem) => (
    <ListItemRow
      key={item.id}
      item={item}
      aisles={aisles}
      unitSystem={settings.unitSystem}
      onToggle={() => void toggle(item)}
      onEdit={(text) => void editItem(db, list.id, item.id, text)}
      onDelete={() => void deleteItem(db, list.id, item.id)}
      onMove={(aisleId) => void moveItemToAisle(db, list.id, item.id, aisleId)}
    />
  );

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-24">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{list.name}</h1>
          <p className="text-sm text-slate-500">From {list.sources.map((s) => `${s.title} (${s.targetServings})`).join(', ')}</p>
        </div>
        <div className="flex shrink-0 gap-1">
          <button type="button" onClick={() => void onRename()} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Rename list">
            <Pencil size={18} />
          </button>
          <button type="button" onClick={() => void onCopy()} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Copy list as text">
            <Copy size={18} />
          </button>
        </div>
      </div>
      {copied && <p role="status" className="text-sm text-emerald-700">Copied to clipboard</p>}

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

      {view.aisles.map((section) => (
        <section key={section.id} aria-label={section.title}>
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{section.title}</h2>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">{section.items.map(row)}</ul>
        </section>
      ))}

      {view.pantry.length > 0 && (
        <section aria-label="Check pantry">
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Check pantry</h2>
          <ul className="divide-y divide-slate-100 rounded-xl border border-dashed border-slate-300">{view.pantry.map(row)}</ul>
        </section>
      )}

      {view.inCart.length > 0 && (
        <details className="rounded-xl border border-slate-200 bg-slate-50" aria-label="In cart">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-slate-600">In cart ({view.inCart.length})</summary>
          <ul className="divide-y divide-slate-100">{view.inCart.map(row)}</ul>
        </details>
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

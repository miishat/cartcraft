import { useLiveQuery } from 'dexie-react-hooks';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { deleteList } from '../../app/lists';
import { ConfirmDialog } from '../components/Dialog';
import { ScreenHeader } from '../components/ScreenHeader';
import { useDb } from '../db';
import { recipeCover } from '../recipeCover';
import { TINT_CLASS } from '../tints';

const DATE = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

/** Saved lists, newest first. */
export function ListsScreen() {
  const db = useDb();
  const lists = useLiveQuery(() => db.lists.orderBy('createdAt').reverse().toArray(), [db]);
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(null);
  if (!lists) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <ScreenHeader title="Lists" />
      {lists.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
          No lists yet. Select recipes and build one.
        </p>
      ) : (
        <ul className="space-y-3">
          {lists.map((list) => {
            const done = list.items.filter((i) => i.checked).length;
            const total = list.items.length;
            const finished = total > 0 && done === total;
            const pct = total === 0 ? 0 : Math.round((done / total) * 100);
            const covers = list.sources.slice(0, 3);
            const more = list.sources.length - covers.length;
            return (
              <li key={list.id} className="flex items-start gap-3 rounded-2xl bg-white p-3 ring-1 ring-slate-200">
                <Link to={`/lists/${list.id}`} className="min-w-0 flex-1 space-y-2.5">
                  <span className="flex items-center gap-3">
                    <span aria-hidden="true" className="flex shrink-0">
                      {covers.map((source, i) => {
                        const { emoji, tint } = recipeCover({ id: source.recipeId, title: source.title });
                        return (
                          <span key={source.recipeId} className={`flex h-10 w-10 items-center justify-center rounded-xl text-xl ring-2 ring-white ${TINT_CLASS[tint]} ${i > 0 ? '-ml-3' : ''}`}>
                            {emoji}
                          </span>
                        );
                      })}
                      {more > 0 && (
                        <span className="-ml-3 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-xs font-semibold text-slate-600 ring-2 ring-white">+{more}</span>
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-slate-900">{list.name}</span>
                      <span className="block truncate text-xs text-slate-500">{list.sources.map((s) => s.title).join(', ')}</span>
                    </span>
                  </span>
                  <span className="flex items-center gap-3 text-sm">
                    <span
                      role="progressbar"
                      aria-label="Shopping progress"
                      aria-valuemin={0}
                      aria-valuemax={total}
                      aria-valuenow={done}
                      className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200"
                    >
                      <span className="block h-full rounded-full bg-emerald-600" style={{ width: `${pct}%` }} />
                    </span>
                    <span className={`shrink-0 tabular-nums ${finished ? 'font-semibold text-emerald-700' : 'text-slate-500'}`}>{done}/{total}</span>
                  </span>
                  <span className="block text-xs text-slate-500">📅 {DATE.format(list.createdAt)}</span>
                </Link>
                <button
                  type="button"
                  onClick={() => setToDelete({ id: list.id, name: list.name })}
                  className="p-2 text-slate-400 hover:text-red-600"
                  aria-label={`Delete ${list.name}`}
                >
                  <Trash2 size={16} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {toDelete && (
        <ConfirmDialog
          title={`Delete "${toDelete.name}"?`}
          message="This list will be removed. Your recipes are not affected."
          confirmLabel="Delete list"
          danger
          onCancel={() => setToDelete(null)}
          onConfirm={() => {
            setToDelete(null);
            void deleteList(db, toDelete.id);
          }}
        />
      )}
    </div>
  );
}

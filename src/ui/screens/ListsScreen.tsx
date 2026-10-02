import { useLiveQuery } from 'dexie-react-hooks';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { deleteList } from '../../app/lists';
import { ProgressBar } from '../components/ProgressBar';
import { ConfirmDialog } from '../components/Dialog';
import { useDb } from '../db';

/** Saved lists, newest first. */
export function ListsScreen() {
  const db = useDb();
  const lists = useLiveQuery(() => db.lists.orderBy('createdAt').reverse().toArray(), [db]);
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(null);
  if (!lists) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-[28px] font-bold tracking-tight text-slate-900">Lists</h1>
      {lists.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
          No lists yet. Select recipes and build one.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
          {lists.map((list) => (
            <li key={list.id} className="flex items-center gap-3 px-4 py-3">
              <Link to={`/lists/${list.id}`} className="min-w-0 flex-1 space-y-2">
                <p className="truncate font-semibold text-slate-900">{list.name}</p>
                <ProgressBar done={list.items.filter((i) => i.checked).length} total={list.items.length} />
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
          ))}
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

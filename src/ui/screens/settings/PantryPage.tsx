import { useLiveQuery } from 'dexie-react-hooks';
import { X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { addPantryStaple, removePantryStaple } from '../../../app/settings';
import { ErrorNote } from '../../components/ErrorNote';
import { useDb } from '../../db';
import { useAsyncAction } from '../../useAsyncAction';
import { CARD, SettingsPage } from './SettingsPage';

export function PantryPage() {
  const db = useDb();
  const pantry = useLiveQuery(() => db.pantryStaples.orderBy('itemKey').toArray(), [db]);
  const [staple, setStaple] = useState('');
  const action = useAsyncAction((fn: () => Promise<void>) => fn(), 'Could not update pantry staples. Try again.');

  const onAdd = (e: FormEvent) => {
    e.preventDefault();
    void action.run(async () => {
      if (await addPantryStaple(db, staple)) setStaple('');
    });
  };

  return (
    <SettingsPage title="Pantry staples" hint={'These go in a "Check pantry" section instead of an aisle.'}>
      {pantry && pantry.length > 0 && (
        <ul className={`${CARD} flex flex-wrap gap-2 p-3`}>
          {pantry.map((p) => (
            <li key={p.itemKey} className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-1 pl-3 pr-1 text-sm text-slate-800">
              {p.itemKey}
              <button
                type="button"
                onClick={() => void action.run(() => removePantryStaple(db, p.itemKey))}
                className="rounded-full p-1 text-slate-500 hover:bg-white"
                aria-label={`Remove ${p.itemKey}`}
              >
                <X size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={onAdd} className={`${CARD} flex items-center gap-2 p-2 pl-4 focus-within:ring-2 focus-within:ring-emerald-600`}>
        <input
          className="min-w-0 flex-1 bg-transparent py-1.5 outline-none"
          value={staple}
          onChange={(e) => setStaple(e.target.value)}
          aria-label="New pantry staple"
          placeholder="Add a staple, e.g. garlic powder"
        />
        <button type="submit" disabled={!staple.trim()} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
          Add
        </button>
      </form>
      <ErrorNote message={action.error} />
    </SettingsPage>
  );
}

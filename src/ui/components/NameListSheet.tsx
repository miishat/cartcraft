import { useState, type FormEvent } from 'react';
import { ErrorNote } from './ErrorNote';
import { Sheet } from './Sheet';

/** Asks for the new list's name, prefilled and with suggestion chips. */
export function NameListSheet({ initialName, suggestions, pending, error, onCancel, onCreate }: {
  initialName: string;
  suggestions: string[];
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onCreate: (name: string) => void;
}) {
  const [name, setName] = useState(initialName);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onCreate(name.trim() || initialName);
  };
  return (
    <Sheet title="Name your list" onClose={onCancel}>
      <form onSubmit={submit} className="space-y-4 px-5 pb-3">
        <label className="block text-sm font-medium text-slate-700">
          List name
          <input
            className="mt-1 w-full rounded-xl px-3 py-2.5 ring-1 ring-slate-300 outline-none focus:ring-2 focus:ring-emerald-600"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
          />
        </label>
        <div role="group" aria-label="Suggestions" className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button key={s} type="button" onClick={() => setName(s)} aria-pressed={name === s} className={`max-w-full truncate rounded-full px-3 py-1.5 text-sm ${name === s ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-700'}`}>
              {s}
            </button>
          ))}
        </div>
        <ErrorNote message={error} />
        <button type="submit" disabled={pending} className="w-full rounded-2xl bg-slate-900 px-4 py-3 font-semibold text-white disabled:opacity-50">
          Create list
        </button>
      </form>
    </Sheet>
  );
}

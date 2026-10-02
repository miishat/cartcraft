import { Minus, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { updateSettings } from '../../../data/db';
import { ErrorNote } from '../../components/ErrorNote';
import { useDb } from '../../db';
import { useSettings } from '../../hooks';
import { useAsyncAction } from '../../useAsyncAction';
import { CARD, SettingsPage } from './SettingsPage';

const MAX = 99;
const STEP = 'inline-flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-40';

export function ServingsPage() {
  const db = useDb();
  const settings = useSettings();
  const value = settings.defaultServings;
  // A local draft lets the field be cleared while typing; only positive whole numbers are saved.
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const save = useAsyncAction((fn: () => Promise<void>) => fn(), 'Could not save that setting. Try again.');
  const set = (n: number) => void save.run(() => updateSettings(db, { defaultServings: n }));

  return (
    <SettingsPage title="Default servings" hint="Recipes start at this many servings when you pick them for a list, and new recipes use it when they don't say.">
      <div className={`${CARD} flex items-center justify-center gap-5 p-5`}>
        <button type="button" aria-label="Fewer servings" disabled={value <= 1} onClick={() => set(value - 1)} className={STEP}>
          <Minus size={18} aria-hidden="true" />
        </button>
        <input
          type="number"
          min={1}
          max={MAX}
          aria-label="Default servings"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            const n = Number(e.target.value);
            if (e.target.value !== '' && Number.isInteger(n) && n > 0) set(n);
          }}
          onBlur={() => setDraft(String(value))}
          className="w-20 bg-transparent text-center text-3xl font-bold tabular-nums text-slate-900 outline-none [appearance:textfield] focus:rounded-lg focus:ring-2 focus:ring-emerald-600 [&::-webkit-inner-spin-button]:appearance-none"
        />
        <button type="button" aria-label="More servings" disabled={value >= MAX} onClick={() => set(value + 1)} className={STEP}>
          <Plus size={18} aria-hidden="true" />
        </button>
      </div>
      <ErrorNote message={save.error} />
    </SettingsPage>
  );
}

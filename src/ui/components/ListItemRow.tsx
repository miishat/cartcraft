import { Check, MoreHorizontal } from 'lucide-react';
import { useState } from 'react';
import { formatAmounts, type ListItem, type UnitSystem } from '../../domain';
import { itemLabel } from '../../app/listView';
import type { Aisle } from '../../data/types';

interface Props {
  item: ListItem;
  aisles: Aisle[];
  unitSystem: UnitSystem;
  onToggle: () => void;
  onEdit: (text: string) => void;
  onDelete: () => void;
  onMove: (aisleId: string) => void;
}

/** One shopping row. The whole row toggles; the menu button reveals edit, move and delete. */
export function ListItemRow({ item, aisles, unitSystem, onToggle, onEdit, onDelete, onMove }: Props) {
  const [open, setOpen] = useState(false);
  const amount = formatAmounts(item.amounts, unitSystem);
  const [draft, setDraft] = useState(amount ? `${amount} ${item.name}` : item.name);

  return (
    <li className="rounded-lg bg-white">
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={item.checked}
          aria-label={itemLabel(item, unitSystem)}
          className="flex min-h-12 flex-1 items-center gap-3 px-3 py-2 text-left"
        >
          <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${item.checked ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300'}`}>
            {item.checked && <Check size={14} className="text-white" />}
          </span>
          <span className={`min-w-0 flex-1 ${item.checked ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
            <span className="font-medium">{item.name.charAt(0).toUpperCase() + item.name.slice(1)}</span>
            {amount && <span className="ml-2 text-slate-500">{amount}</span>}
            {item.notes && <span className="block text-xs text-slate-400">{item.notes}</span>}
          </span>
        </button>
        <button type="button" onClick={() => setOpen(!open)} className="px-3 text-slate-400" aria-label={`Options for ${item.name}`} aria-expanded={open}>
          <MoreHorizontal size={18} />
        </button>
      </div>
      {open && (
        <div className="space-y-2 border-t border-slate-100 px-3 py-2 text-sm">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (draft.trim()) {
                onEdit(draft);
                setOpen(false);
              }
            }}
          >
            <input className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={`Edit ${item.name}`} />
            <button type="submit" className="rounded bg-slate-900 px-3 py-1 text-white">Save</button>
          </form>
          <div className="flex items-center gap-2">
            <label className="flex flex-1 items-center gap-2">
              Aisle
              <select className="flex-1 rounded border border-slate-200 px-2 py-1" value={item.aisleId} onChange={(e) => onMove(e.target.value)} aria-label={`Aisle for ${item.name}`}>
                {aisles.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
            <button type="button" onClick={onDelete} className="font-medium text-red-700">Delete</button>
          </div>
        </div>
      )}
    </li>
  );
}

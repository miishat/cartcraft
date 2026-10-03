import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { formatAmount, parseIngredientLine, type IngredientLine, type UnitSystem } from '../../domain';
import { reparseLine } from '../../app/recipes';

interface Props {
  lines: IngredientLine[];
  onChange: (lines: IngredientLine[]) => void;
  unitSystem: UnitSystem;
  makeId: () => string;
}

function parsedSummary(line: IngredientLine, system: UnitSystem): string {
  if (line.isHeader) return 'Section heading';
  const formatted = line.quantity
    ? formatAmount({ quantity: line.quantity, ...(line.unit ? { unit: line.unit } : {}), ...(line.packageSize ? { packageSize: line.packageSize } : {}) }, system, line.item)
    : '';
  const amount = formatted || 'no amount';
  const notes = line.notes ? ` (${line.notes})` : '';
  return `${amount} · ${line.item || '?'}${notes}`;
}

function LineRow({ line, index, system, onEdit, onRemove }: {
  line: IngredientLine;
  index: number;
  system: UnitSystem;
  onEdit: (raw: string) => void;
  onRemove: () => void;
}) {
  const [draft, setDraft] = useState(line.raw);
  const flagged = line.needsReview && !line.isHeader;
  return (
    <li className={`rounded-lg border p-3 ${flagged ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-center gap-2">
        <input
          className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1 font-mono text-sm"
          value={draft}
          aria-label={`Ingredient line ${index + 1}`}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => draft !== line.raw && onEdit(draft)}
        />
        <button type="button" onClick={onRemove} className="p-2 text-slate-400 hover:text-red-600" aria-label={`Remove line ${index + 1}`}>
          <Trash2 size={16} />
        </button>
      </div>
      <p className="mt-1 flex items-center gap-1 text-xs text-slate-500" data-testid="parsed">
        {flagged && <AlertTriangle size={12} className="text-amber-600" aria-label="Check this line" />}
        {parsedSummary(line, system)}
      </p>
    </li>
  );
}

/** Editable review of parsed lines. Flagged lines are highlighted; editing a line re-parses it. */
export function ReviewTable({ lines, onChange, unitSystem, makeId }: Props) {
  return (
    <div>
      <ul className="space-y-2">
        {lines.map((line, index) => (
          <LineRow
            key={line.id}
            line={line}
            index={index}
            system={unitSystem}
            onEdit={(raw) => onChange(lines.map((l) => (l.id === line.id ? reparseLine(l, raw) : l)))}
            onRemove={() => onChange(lines.filter((l) => l.id !== line.id))}
          />
        ))}
      </ul>
      <button
        type="button"
        className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-emerald-800"
        onClick={() => onChange([...lines, parseIngredientLine('', makeId())])}
      >
        <Plus size={16} /> Add line
      </button>
    </div>
  );
}

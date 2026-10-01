import { Minus, Plus } from 'lucide-react';

interface Props {
  value: number;
  onChange: (value: number) => void;
  label: string;
  min?: number;
  max?: number;
}

export function ServingsStepper({ value, onChange, label, min = 1, max = 99 }: Props) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-1 py-1" role="group" aria-label={label}>
      <button
        type="button"
        className="rounded-full p-2 hover:bg-white disabled:opacity-40"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label={`Fewer servings for ${label}`}
      >
        <Minus size={14} />
      </button>
      <span className="w-8 text-center text-sm font-semibold" aria-live="polite">{value}</span>
      <button
        type="button"
        className="rounded-full p-2 hover:bg-white disabled:opacity-40"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label={`More servings for ${label}`}
      >
        <Plus size={14} />
      </button>
    </div>
  );
}

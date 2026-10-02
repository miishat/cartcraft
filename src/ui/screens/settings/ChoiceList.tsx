import { Check } from 'lucide-react';
import { CARD_LIST, GROUP_LABEL } from './SettingsPage';

export interface Choice<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

interface Props<T extends string> {
  name: string;
  legend: string;
  /** Show the legend as a small heading above the card; otherwise it is for screen readers only. */
  showLegend?: boolean;
  choices: readonly Choice<T>[];
  value: T;
  onChange: (value: T) => void;
}

/** Radio choices drawn as rows in a card; the chosen row has a tick. */
export function ChoiceList<T extends string>({ name, legend, showLegend = false, choices, value, onChange }: Props<T>) {
  return (
    <fieldset>
      <legend className={showLegend ? GROUP_LABEL : 'sr-only'}>{legend}</legend>
      <div className={CARD_LIST}>
        {choices.map((choice) => (
          <label key={choice.value} className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-slate-50 has-[:focus-visible]:bg-slate-100 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-inset has-[:focus-visible]:ring-emerald-600">
            <input
              type="radio"
              name={name}
              value={choice.value}
              checked={value === choice.value}
              onChange={() => onChange(choice.value)}
              className="sr-only"
            />
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-slate-900">{choice.label}</span>
              {choice.hint && <span className="block text-sm text-slate-500">{choice.hint}</span>}
            </span>
            {value === choice.value && <Check size={18} className="shrink-0 text-emerald-700" aria-hidden="true" />}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

import { useState } from 'react';
import { getPalette, getThemePref, PALETTES, setPalette, setThemePref, type Palette, type ThemePref } from '../../theme';
import { ChoiceList, type Choice } from './ChoiceList';
import { GROUP_LABEL, SettingsPage } from './SettingsPage';

const MODE_CHOICES: Choice<ThemePref>[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/** Short names for the Settings home. */
export const THEME_LABEL: Record<ThemePref, string> = { system: 'System', light: 'Light', dark: 'Dark' };

const SWATCH: Record<Palette, string> = {
  basil: 'bg-swatch-basil',
  tomato: 'bg-swatch-tomato',
  blueberry: 'bg-swatch-blueberry',
  saffron: 'bg-swatch-saffron',
  plum: 'bg-swatch-plum',
  paper: 'bg-swatch-paper',
};

export function AppearancePage() {
  const [pref, setPref] = useState(getThemePref);
  const [palette, setPaletteState] = useState(getPalette);
  return (
    <SettingsPage title="Appearance" hint="Colours for this device.">
      <fieldset>
        <legend className={GROUP_LABEL}>Palette</legend>
        <div className="grid grid-cols-3 gap-2">
          {PALETTES.map((p) => (
            <label
              key={p.id}
              className={`flex cursor-pointer flex-col items-center gap-2 rounded-2xl bg-white p-3 ring-1 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-emerald-600 ${palette === p.id ? 'ring-2 ring-slate-900' : 'ring-slate-200'}`}
            >
              <input
                type="radio"
                name="palette"
                value={p.id}
                checked={palette === p.id}
                onChange={() => {
                  setPaletteState(p.id);
                  setPalette(p.id);
                }}
                className="sr-only"
              />
              <span aria-hidden="true" className={`h-9 w-9 rounded-full ${SWATCH[p.id]}`} />
              <span className="text-sm font-medium text-slate-900">{p.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <ChoiceList
        name="theme"
        legend="Mode"
        showLegend
        choices={MODE_CHOICES}
        value={pref}
        onChange={(value) => {
          setPref(value);
          setThemePref(value);
        }}
      />
    </SettingsPage>
  );
}

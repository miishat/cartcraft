import { useState } from 'react';
import { getThemePref, setThemePref, type ThemePref } from '../../theme';
import { ChoiceList, type Choice } from './ChoiceList';
import { SettingsPage } from './SettingsPage';

const THEME_CHOICES: Choice<ThemePref>[] = [
  { value: 'system', label: 'Match my device' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/** Short names for the Settings home. */
export const THEME_LABEL: Record<ThemePref, string> = { system: 'Match device', light: 'Light', dark: 'Dark' };

export function AppearancePage() {
  const [pref, setPref] = useState(getThemePref);
  return (
    <SettingsPage title="Appearance" hint="Colours for this device.">
      <ChoiceList
        name="theme"
        legend="Theme"
        choices={THEME_CHOICES}
        value={pref}
        onChange={(value) => {
          setPref(value);
          setThemePref(value);
        }}
      />
    </SettingsPage>
  );
}

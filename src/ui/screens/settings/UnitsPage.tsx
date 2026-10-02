import { updateSettings } from '../../../data/db';
import type { UnitSystem } from '../../../domain';
import { ErrorNote } from '../../components/ErrorNote';
import { useDb } from '../../db';
import { useSettings } from '../../hooks';
import { useAsyncAction } from '../../useAsyncAction';
import { ChoiceList, type Choice } from './ChoiceList';
import { SettingsPage } from './SettingsPage';

const UNIT_CHOICES: Choice<UnitSystem>[] = [
  { value: 'us', label: 'US', hint: 'cups, oz, lb' },
  { value: 'metric', label: 'Metric', hint: 'ml, g, kg' },
];

/** Short names for the Settings home. */
export const UNIT_LABEL: Record<UnitSystem, string> = { us: 'US', metric: 'Metric' };

export function UnitsPage() {
  const db = useDb();
  const settings = useSettings();
  const save = useAsyncAction((fn: () => Promise<void>) => fn(), 'Could not save that setting. Try again.');
  return (
    <SettingsPage title="Units" hint="Amounts on recipes and lists use this system.">
      <ChoiceList
        name="units"
        legend="Unit system"
        choices={UNIT_CHOICES}
        value={settings.unitSystem}
        onChange={(unitSystem) => void save.run(() => updateSettings(db, { unitSystem }))}
      />
      <ErrorNote message={save.error} />
    </SettingsPage>
  );
}

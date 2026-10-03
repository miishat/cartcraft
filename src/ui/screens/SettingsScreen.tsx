import { useLiveQuery } from 'dexie-react-hooks';
import { useId, type ReactNode } from 'react';
import { getAiKeyStatus } from '../../app/ai';
import { getProvider } from '../../services/providers';
import { AppLogo } from '../components/AppLogo';
import { ScreenHeader } from '../components/ScreenHeader';
import { useDb } from '../db';
import { useAisles, useSettings, useStorageUsage } from '../hooks';
import { getPalette, getThemePref, PALETTES } from '../theme';
import { THEME_LABEL } from './settings/AppearancePage';
import { CARD_LIST, GROUP_LABEL } from './settings/SettingsPage';
import { SettingsRow } from './settings/SettingsRow';
import { aiSummary, aisleSummary, pantrySummary } from './settings/summaries';
import { UNIT_LABEL } from './settings/UnitsPage';

function Group({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className={GROUP_LABEL}>{title}</h2>
      <ul className={CARD_LIST}>{children}</ul>
    </section>
  );
}

/** Settings home: one row per page, each with a short summary of what is set. */
export function SettingsScreen() {
  const db = useDb();
  const settings = useSettings();
  const aisles = useAisles();
  const usage = useStorageUsage();
  const pantry = useLiveQuery(() => db.pantryStaples.orderBy('itemKey').primaryKeys(), [db]);
  const keyStatus = useLiveQuery(() => getAiKeyStatus(db), [db]);
  const provider = getProvider(settings.llm.providerId);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <ScreenHeader title="Settings" />

      <Group title="Shopping">
        <SettingsRow to="/settings/appearance" emoji="🎨" tint="gray" title="Appearance" value={`${PALETTES.find((p) => p.id === getPalette())?.label}, ${THEME_LABEL[getThemePref()]}`} />
        <SettingsRow to="/settings/units" emoji="⚖️" tint="blue" title="Units" value={UNIT_LABEL[settings.unitSystem]} />
        <SettingsRow to="/settings/servings" emoji="🍽️" tint="amber" title="Default Servings" value={String(settings.defaultServings)} />
        <SettingsRow to="/settings/aisles" emoji="🛒" tint="green" title="Aisles" summary={aisles ? aisleSummary(aisles.length) : undefined} />
        <SettingsRow to="/settings/pantry" emoji="🫙" tint="orange" title="Pantry Staples" summary={pantry ? pantrySummary(pantry) : undefined} />
      </Group>

      <Group title="AI">
        <SettingsRow to="/settings/ai" emoji="✨" tint="purple" title="AI Helper" summary={keyStatus ? aiSummary(keyStatus, provider.name) : undefined} />
      </Group>

      <Group title="Your data">
        <SettingsRow to="/settings/backup" emoji="💾" tint="teal" title="Backup & Restore" summary="Export, import, share" />
        <SettingsRow to="/settings/storage" emoji="📦" tint="gray" title="Storage" value={usage ?? undefined} />
      </Group>

      <p className="flex items-center justify-center gap-2 text-xs text-slate-400">
        <AppLogo className="h-5 w-5" /> CartCraft {__APP_VERSION__}
      </p>
    </div>
  );
}

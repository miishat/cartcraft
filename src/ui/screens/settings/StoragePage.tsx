import { useSettings, useStorageUsage } from '../../hooks';
import { CARD_LIST, SettingsPage } from './SettingsPage';

const ROW = 'flex items-start justify-between gap-4 px-4 py-3';

export function StoragePage() {
  const settings = useSettings();
  const usage = useStorageUsage();
  const protection =
    settings.persistGranted === true ? 'This browser will keep your data.'
      : settings.persistGranted === false ? 'This browser may clear your data when space runs low. Export backups regularly.'
        : 'Storage protection is requested after you save your first recipe.';

  return (
    <SettingsPage title="Storage" hint="Everything is kept in this browser on this device.">
      <dl className={CARD_LIST}>
        <div className={ROW}>
          <dt className="font-medium text-slate-900">Used</dt>
          <dd className="text-sm text-slate-500">{usage ?? 'Unknown'}</dd>
        </div>
        <div className={ROW}>
          <dt className="shrink-0 font-medium text-slate-900">Protection</dt>
          <dd className="text-right text-sm text-slate-500">{protection}</dd>
        </div>
        <div className={ROW}>
          <dt className="font-medium text-slate-900">Version</dt>
          <dd className="text-sm text-slate-500">{__APP_VERSION__}</dd>
        </div>
      </dl>
    </SettingsPage>
  );
}

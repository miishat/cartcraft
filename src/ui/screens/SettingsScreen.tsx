import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { addPantryStaple, moveAisle, removePantryStaple, renameAisle } from '../../app/settings';
import {
  MAX_BACKUP_BYTES, backupFileName, exportBackup, importBackup, parseBackup, serializeBackup, summarizeBackup, undoLastImport,
  type BackupFile, type ParseResult,
} from '../../data/backup';
import { updateSettings } from '../../data/db';
import { AiSettings } from '../components/AiSettings';
import { ErrorNote } from '../components/ErrorNote';
import { useDb } from '../db';
import { useAisles, useSettings } from '../hooks';
import { useAsyncAction } from '../useAsyncAction';

const IMPORT_ERRORS: Record<Exclude<ParseResult, { ok: true }>['error'], string> = {
  too_large: 'That file is too large to be a CartCraft backup.',
  not_json: 'That is not a valid backup file (not JSON).',
  wrong_format: 'That file is not a CartCraft backup.',
  newer_version: 'That backup comes from a newer version of CartCraft. Update this app first.',
  invalid: 'That backup is damaged or incomplete.',
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4" aria-label={title}>
      <h2 className="font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}

/** Keeps a local draft so the field can be cleared while typing; saves only positive whole numbers. */
function DefaultServings({ value, onSave }: { value: number; onSave: (n: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <label className="flex items-center gap-3">
      Default servings
      <input
        type="number"
        min={1}
        className="w-20 rounded border border-slate-200 px-2 py-1"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value !== '' && Number.isInteger(n) && n > 0) onSave(n);
        }}
        onBlur={() => setDraft(String(value))}
      />
    </label>
  );
}

/** Share sheets accept text/plain files but not application/json, so shared backups use a .txt name. */
function shareableFile(text: string, fileName: string): File {
  return new File([text], fileName.replace(/\.json$/, '.txt'), { type: 'text/plain' });
}

function canShareFiles(): boolean {
  try {
    return typeof navigator.share === 'function' && navigator.canShare?.({ files: [shareableFile('', 'probe.json')] }) === true;
  } catch {
    return false;
  }
}

function download(text: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  // Safari starts the download asynchronously; revoking at once can cancel it.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface Props {
  now?: () => number;
}

export function SettingsScreen({ now = Date.now }: Props) {
  const db = useDb();
  const settings = useSettings();
  const aisles = useAisles();
  const pantry = useLiveQuery(() => db.pantryStaples.orderBy('itemKey').toArray(), [db]);
  const canUndo = useLiveQuery(async () => (await db.snapshots.get('last-import')) !== undefined, [db]);
  const [staple, setStaple] = useState('');
  const [pasted, setPasted] = useState('');
  const [pending, setPending] = useState<BackupFile | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [usage, setUsage] = useState<string | null>(null);
  const [shareable] = useState(canShareFiles);

  useEffect(() => {
    void navigator.storage?.estimate?.().then((e) => {
      if (e.usage !== undefined) setUsage(`${(e.usage / 1024 / 1024).toFixed(1)} MB used`);
    });
  }, []);

  const prefs = useAsyncAction((fn: () => Promise<void>) => fn(), 'Could not save that setting. Try again.');
  const pantryAction = useAsyncAction((fn: () => Promise<void>) => fn(), 'Could not update pantry staples. Try again.');
  const aisleAction = useAsyncAction((fn: () => Promise<void>) => fn(), 'Could not update aisles. Try again.');

  const exportAction = useAsyncAction(async () => {
    const at = now();
    download(serializeBackup(await exportBackup(db, at)), backupFileName(at));
    setMessage('Backup downloaded.');
  }, 'Could not create the backup. Try again.');

  const shareAction = useAsyncAction(async () => {
    const at = now();
    const file = shareableFile(serializeBackup(await exportBackup(db, at)), backupFileName(at));
    try {
      await navigator.share({ files: [file], title: 'CartCraft backup' });
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) setMessage('Sharing failed. Use Export backup instead.');
    }
  }, 'Could not create the backup. Try again.');

  const onAddStaple = (e: FormEvent) => {
    e.preventDefault();
    void pantryAction.run(async () => {
      if (await addPantryStaple(db, staple)) setStaple('');
    });
  };

  const readImport = (text: string) => {
    const result = parseBackup(text);
    if (result.ok) {
      setPending(result.backup);
      setMessage(null);
    } else {
      setPending(null);
      setMessage(IMPORT_ERRORS[result.error]);
    }
  };

  const fileAction = useAsyncAction(async (file: File) => {
    if (file.size > MAX_BACKUP_BYTES) {
      setPending(null);
      setMessage(IMPORT_ERRORS.too_large);
      return;
    }
    readImport(await file.text());
  }, 'Could not read that file.');

  const importAction = useAsyncAction(async (backup: BackupFile) => {
    await importBackup(db, backup, now());
    setPending(null);
    setPasted('');
    setMessage('Import complete. Your previous data can be restored with Undo last import.');
  }, 'Import failed. Your data was not changed.');

  const undoAction = useAsyncAction(async () => {
    if (await undoLastImport(db)) setMessage('Previous data restored.');
  }, 'Could not restore the previous data. Try again.');

  const summary = pending ? summarizeBackup(pending.data) : null;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>

      <Section title="Units and servings">
        <fieldset className="flex gap-4">
          <legend className="sr-only">Unit system</legend>
          {(['us', 'metric'] as const).map((system) => (
            <label key={system} className="flex items-center gap-2">
              <input type="radio" name="units" checked={settings.unitSystem === system} onChange={() => void prefs.run(() => updateSettings(db, { unitSystem: system }))} />
              {system === 'us' ? 'US (cups, oz, lb)' : 'Metric (ml, g, kg)'}
            </label>
          ))}
        </fieldset>
        <DefaultServings value={settings.defaultServings} onSave={(n) => void prefs.run(() => updateSettings(db, { defaultServings: n }))} />
        <ErrorNote message={prefs.error} />
      </Section>

      <Section title="Pantry staples">
        <p className="text-sm text-slate-500">These go in a "Check pantry" section instead of an aisle.</p>
        <ul className="flex flex-wrap gap-2">
          {pantry?.map((p) => (
            <li key={p.itemKey} className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-1 pl-3 pr-1 text-sm">
              {p.itemKey}
              <button type="button" onClick={() => void pantryAction.run(() => removePantryStaple(db, p.itemKey))} className="rounded-full p-1 hover:bg-white" aria-label={`Remove ${p.itemKey}`}>
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
        <form onSubmit={onAddStaple} className="flex gap-2">
          <input className="flex-1 rounded border border-slate-200 px-2 py-1" value={staple} onChange={(e) => setStaple(e.target.value)} aria-label="New pantry staple" placeholder="e.g. garlic powder" />
          <button type="submit" className="rounded bg-slate-900 px-3 py-1 text-sm text-white">Add</button>
        </form>
        <ErrorNote message={pantryAction.error} />
      </Section>

      <Section title="Aisles">
        <p className="text-sm text-slate-500">Lists follow this order. Rename aisles to match your store.</p>
        <ol className="space-y-1">
          {aisles?.map((aisle, index) => (
            <li key={aisle.id} className="flex items-center gap-2">
              <input
                className="flex-1 rounded border border-slate-200 px-2 py-1"
                defaultValue={aisle.name}
                aria-label={`Name of ${aisle.name}`}
                onBlur={(e) => {
                  const name = e.target.value.trim();
                  if (!name) e.target.value = aisle.name;
                  else if (name !== aisle.name) void aisleAction.run(() => renameAisle(db, aisle.id, name));
                }}
              />
              <button type="button" disabled={index === 0} onClick={() => void aisleAction.run(() => moveAisle(db, aisle.id, 'up'))} className="p-1 disabled:opacity-30" aria-label={`Move ${aisle.name} up`}>
                <ArrowUp size={16} />
              </button>
              <button type="button" disabled={index === aisles.length - 1} onClick={() => void aisleAction.run(() => moveAisle(db, aisle.id, 'down'))} className="p-1 disabled:opacity-30" aria-label={`Move ${aisle.name} down`}>
                <ArrowDown size={16} />
              </button>
            </li>
          ))}
        </ol>
        <ErrorNote message={aisleAction.error} />
      </Section>

      <Section title="AI helper">
        <AiSettings />
      </Section>

      <Section title="Backup">
        <p className="text-sm text-slate-500">
          Data lives only on this device. Export a backup to move it to another device. Your AI key is never included.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void exportAction.run()} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white">Export backup</button>
          {shareable && (
            <button type="button" onClick={() => void shareAction.run()} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Share backup</button>
          )}
          <label className="cursor-pointer rounded-lg border border-slate-300 px-4 py-2 text-sm">
            Import file
            <input
              type="file"
              accept=".json,application/json,text/plain"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                // Reset so picking the same file again still fires change.
                e.target.value = '';
                if (file) void fileAction.run(file);
              }}
            />
          </label>
          {canUndo && (
            <button type="button" onClick={() => void undoAction.run()} className="rounded-lg border border-amber-400 px-4 py-2 text-sm text-amber-800">Undo last import</button>
          )}
        </div>
        <details>
          <summary className="cursor-pointer text-sm text-slate-600">Or paste a backup</summary>
          <textarea className="mt-2 h-24 w-full rounded border border-slate-200 p-2 font-mono text-xs" value={pasted} onChange={(e) => setPasted(e.target.value)} aria-label="Paste backup" />
          <button type="button" disabled={!pasted.trim()} onClick={() => readImport(pasted)} className="mt-1 rounded border border-slate-300 px-3 py-1 text-sm disabled:opacity-40">Check backup</button>
        </details>
        {summary && pending && (
          <div role="alert" className="space-y-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            <p>
              This backup has {summary.recipes} recipes, {summary.lists} lists, {summary.pantryStaples} pantry staples and{' '}
              {summary.aisleOverrides} aisle choices. Importing replaces everything on this device.
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => void importAction.run(pending)} disabled={importAction.pending} className="rounded bg-amber-700 px-3 py-1 text-white disabled:opacity-50">Replace my data</button>
              <button type="button" onClick={() => setPending(null)} className="rounded border border-amber-300 px-3 py-1">Cancel</button>
            </div>
          </div>
        )}
        <ErrorNote message={exportAction.error ?? shareAction.error ?? fileAction.error ?? importAction.error ?? undoAction.error} />
        {message && <p role="status" className="text-sm text-slate-700">{message}</p>}
      </Section>

      <Section title="Storage">
        <p className="text-sm text-slate-600">
          {settings.persistGranted === true && 'This browser will keep your data. '}
          {settings.persistGranted === false && 'This browser may clear your data when space runs low. Export backups regularly. '}
          {settings.persistGranted === undefined && 'Storage protection is requested after you save your first recipe. '}
          {usage}
        </p>
      </Section>
    </div>
  );
}

import { useLiveQuery } from 'dexie-react-hooks';
import { useState, type ReactNode } from 'react';
import {
  MAX_BACKUP_BYTES, backupFileName, exportBackup, importBackup, parseBackup, serializeBackup, summarizeBackup, undoLastImport,
  type BackupFile, type ParseResult,
} from '../../../data/backup';
import { ErrorNote } from '../../components/ErrorNote';
import { useDb } from '../../db';
import { TINT_CLASS, type Tint } from '../../tints';
import { useAsyncAction } from '../../useAsyncAction';
import { CARD_LIST, SettingsPage } from './SettingsPage';

const IMPORT_ERRORS: Record<Exclude<ParseResult, { ok: true }>['error'], string> = {
  too_large: 'That file is too large to be a CartCraft backup.',
  not_json: 'That is not a valid backup file (not JSON).',
  wrong_format: 'That file is not a CartCraft backup.',
  newer_version: 'That backup comes from a newer version of CartCraft. Update this app first.',
  invalid: 'That backup is damaged or incomplete.',
};

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

const ROW = 'flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 has-[:focus-visible]:bg-slate-100';

function RowContent({ emoji, tint, title, hint }: { emoji: string; tint: Tint; title: string; hint?: string }) {
  return (
    <>
      <span aria-hidden="true" className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base leading-none ${TINT_CLASS[tint]}`}>
        {emoji}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-slate-900">{title}</span>
        {hint && <span className="block text-sm text-slate-500">{hint}</span>}
      </span>
    </>
  );
}

function ActionRow({ onClick, expanded, children }: { onClick: () => void; expanded?: boolean; children: ReactNode }) {
  return (
    <li>
      <button type="button" onClick={onClick} aria-expanded={expanded} className={ROW}>{children}</button>
    </li>
  );
}

export function BackupPage({ now = Date.now }: { now?: () => number }) {
  const db = useDb();
  const canUndo = useLiveQuery(async () => (await db.snapshots.get('last-import')) !== undefined, [db]);
  const [pasted, setPasted] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const [pending, setPending] = useState<BackupFile | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [shareable] = useState(canShareFiles);

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
      if (!(err instanceof DOMException && err.name === 'AbortError')) setMessage('Sharing failed. Use Export instead.');
    }
  }, 'Could not create the backup. Try again.');

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
    setShowPaste(false);
    setMessage('Import complete. Your previous data can be restored with Undo last import.');
  }, 'Import failed. Your data was not changed.');

  const undoAction = useAsyncAction(async () => {
    if (await undoLastImport(db)) setMessage('Previous data restored.');
  }, 'Could not restore the previous data. Try again.');

  const summary = pending ? summarizeBackup(pending.data) : null;

  return (
    <SettingsPage
      title="Backup and restore"
      hint="Your data lives only on this device. Export a backup to move it or keep it safe. Your AI key is never included."
    >
      <ul className={CARD_LIST}>
        <ActionRow onClick={() => void exportAction.run()}>
          <RowContent emoji="⬇️" tint="teal" title="Export backup" hint="Save a file" />
        </ActionRow>
        {shareable && (
          <ActionRow onClick={() => void shareAction.run()}>
            <RowContent emoji="📤" tint="teal" title="Share backup" hint="Send to another app" />
          </ActionRow>
        )}
        <li>
          <label className={ROW}>
            <RowContent emoji="📂" tint="blue" title="Import from file" />
            <input
              type="file"
              accept=".json,application/json,text/plain"
              // The label's text includes the emoji, so the input gets a clean name of its own.
              aria-label="Import from file"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                // Reset so picking the same file again still fires change.
                e.target.value = '';
                if (file) void fileAction.run(file);
              }}
            />
          </label>
        </li>
        <ActionRow onClick={() => setShowPaste((open) => !open)} expanded={showPaste}>
          <RowContent emoji="📋" tint="blue" title="Paste a backup" />
        </ActionRow>
        {canUndo && (
          <ActionRow onClick={() => void undoAction.run()}>
            <RowContent emoji="↩️" tint="gray" title="Undo last import" />
          </ActionRow>
        )}
      </ul>

      {showPaste && (
        <div className="space-y-2">
          <textarea
            className="h-28 w-full rounded-2xl bg-white p-3 font-mono text-xs ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-emerald-600"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            aria-label="Paste backup"
          />
          <button
            type="button"
            disabled={!pasted.trim()}
            onClick={() => readImport(pasted)}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            Check
          </button>
        </div>
      )}

      {summary && pending && (
        <div role="alert" className="space-y-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
          <p>
            This backup has {summary.recipes} recipes, {summary.lists} lists, {summary.pantryStaples} pantry staples and{' '}
            {summary.aisleOverrides} aisle choices. Importing replaces everything on this device.
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => void importAction.run(pending)} disabled={importAction.pending} className="rounded-xl bg-amber-700 px-4 py-2 font-medium text-white disabled:opacity-50">
              Replace my data
            </button>
            <button type="button" onClick={() => setPending(null)} className="rounded-xl px-4 py-2 font-medium ring-1 ring-amber-300">Cancel</button>
          </div>
        </div>
      )}
      <ErrorNote message={exportAction.error ?? shareAction.error ?? fileAction.error ?? importAction.error ?? undoAction.error} />
      {message && <p role="status" className="text-sm text-slate-700">{message}</p>}
    </SettingsPage>
  );
}

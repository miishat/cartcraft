import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { clearAiKey, saveAiKey, testAiConnection } from '../../app/ai';
import { updateSettings } from '../../data/db';
import { PROVIDERS, getProvider } from '../../services/providers';
import { useDb } from '../db';
import { useSettings } from '../hooks';
import { useAsyncAction } from '../useAsyncAction';
import { ErrorNote } from './ErrorNote';

/** Provider, model and key for the optional AI helper. The key never leaves this device except to the provider. */
export function AiSettings() {
  const db = useDb();
  const settings = useSettings();
  const hasKey = useLiveQuery(async () => Boolean((await db.secrets.get('secrets'))?.llmApiKey), [db]);
  const provider = getProvider(settings.llm.providerId);
  const [model, setModel] = useState(settings.llm.model);
  const [keyDraft, setKeyDraft] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => setModel(settings.llm.model), [settings.llm.model]);

  const save = useAsyncAction((fn: () => Promise<void>) => {
    test.clearError();
    return fn();
  }, 'Could not save AI settings. Try again.');
  const test = useAsyncAction(async () => {
    save.clearError();
    setMessage(null);
    const apiKey = keyDraft.trim() || (await db.secrets.get('secrets'))?.llmApiKey || '';
    await testAiConnection({ providerId: provider.id, model, apiKey });
    setMessage('Connection works.');
  }, 'The connection test failed.');

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        Optional. AI can tidy up pasted recipes, sort unknown items into aisles and suggest swaps. Your key stays on this
        device, is sent only to the provider you choose, and is never included in backups.
      </p>
      <label className="flex items-center gap-3 text-sm">
        Provider
        <select
          className="rounded border border-slate-200 px-2 py-1"
          value={provider.id}
          onChange={(e) => void save.run(() => updateSettings(db, { llm: { providerId: e.target.value, model: '' } }))}
        >
          {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-3 text-sm">
        Model
        <input
          className="flex-1 rounded border border-slate-200 px-2 py-1 font-mono text-xs"
          value={model}
          placeholder={provider.defaultModel}
          onChange={(e) => setModel(e.target.value)}
          onBlur={() => model.trim() !== settings.llm.model && void save.run(() => updateSettings(db, { llm: { providerId: provider.id, model: model.trim() } }))}
        />
      </label>
      {hasKey ? (
        <div className="flex items-center gap-3 text-sm">
          <span className="text-emerald-800">Key saved on this device.</span>
          <button type="button" onClick={() => void save.run(() => clearAiKey(db))} className="font-medium text-red-700">Remove key</button>
        </div>
      ) : (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save.run(async () => {
              await saveAiKey(db, keyDraft);
              setKeyDraft('');
            });
          }}
        >
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            className="flex-1 rounded border border-slate-200 px-2 py-1 font-mono text-xs"
            placeholder={`${provider.name} API key`}
            aria-label="API key"
            value={keyDraft}
            onChange={(e) => setKeyDraft(e.target.value)}
          />
          <button type="submit" disabled={!keyDraft.trim()} className="rounded bg-slate-900 px-3 py-1 text-sm text-white disabled:opacity-40">Save key</button>
        </form>
      )}
      <button
        type="button"
        onClick={() => void test.run()}
        disabled={test.pending || (!hasKey && !keyDraft.trim())}
        className="rounded border border-slate-300 px-3 py-1 text-sm disabled:opacity-40"
      >
        {test.pending ? 'Testing...' : 'Test connection'}
      </button>
      <ErrorNote message={save.error ?? test.error} />
      {message && <p role="status" className="text-sm text-emerald-800">{message}</p>}
    </div>
  );
}

import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { clearAiKey, getAiKeyStatus, saveAiKey, testAiConnection } from '../../app/ai';
import { updateSettings } from '../../data/db';
import { PROVIDERS, getProvider } from '../../services/providers';
import { useDb } from '../db';
import { useSettings } from '../hooks';
import { useAsyncAction } from '../useAsyncAction';
import { ErrorNote } from './ErrorNote';
import { TINT_CLASS } from '../tints';
import { ChoiceList } from '../screens/settings/ChoiceList';
import { CARD, GROUP_LABEL } from '../screens/settings/SettingsPage';

/** Provider, model and key for the optional AI helper. The key never leaves this device except to the provider. */
export function AiSettings() {
  const db = useDb();
  const settings = useSettings();
  const keyStatus = useLiveQuery(() => getAiKeyStatus(db), [db]);
  const hasKey = Boolean(keyStatus?.savedFor);
  const keyMismatch = hasKey && keyStatus?.usableKey === null;
  const provider = getProvider(settings.llm.providerId);
  const [model, setModel] = useState(settings.llm.model);
  const [keyDraft, setKeyDraft] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => setModel(settings.llm.model), [settings.llm.model]);
  useEffect(() => setMessage(null), [settings.llm.providerId, settings.llm.model, model, keyDraft, keyStatus?.usableKey]);

  const save = useAsyncAction((fn: () => Promise<void>) => {
    test.clearError();
    return fn();
  }, 'Could not save AI settings. Try again.');
  const test = useAsyncAction(async () => {
    save.clearError();
    setMessage(null);
    const apiKey = keyDraft.trim() || (await getAiKeyStatus(db)).usableKey || '';
    await testAiConnection({ providerId: provider.id, model, apiKey });
    setMessage('Connection works.');
  }, 'The connection test failed.');

  return (
    <div className="space-y-5">
      <ChoiceList
        name="provider"
        legend="Provider"
        showLegend
        choices={PROVIDERS.map((p) => ({ value: p.id, label: p.name }))}
        value={provider.id}
        onChange={(providerId) => void save.run(() => updateSettings(db, { llm: { providerId, model: '' } }))}
      />

      <label className="block">
        <span className={`block ${GROUP_LABEL}`}>Model</span>
        <input
          className={`${CARD} block w-full px-4 py-3 font-mono text-sm outline-none focus:ring-2 focus:ring-emerald-600`}
          value={model}
          placeholder={provider.defaultModel}
          onChange={(e) => setModel(e.target.value)}
          onBlur={() => model.trim() !== settings.llm.model && void save.run(() => updateSettings(db, { llm: { providerId: provider.id, model: model.trim() } }))}
        />
      </label>

      <div>
        <p className={GROUP_LABEL}>Key</p>
        {hasKey ? (
          <div className={`${CARD} flex items-center gap-3 px-4 py-3`}>
            <span aria-hidden="true" className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base ${TINT_CLASS[keyMismatch ? 'amber' : 'green']}`}>
              {keyMismatch ? '⚠️' : '✓'}
            </span>
            <span className="min-w-0 flex-1 text-sm font-medium text-slate-900">Key saved for {getProvider(keyStatus?.savedFor ?? '').name}.</span>
            <button type="button" onClick={() => void save.run(() => clearAiKey(db))} className="text-sm font-semibold text-red-700">Remove key</button>
          </div>
        ) : (
          <form
            className={`${CARD} flex items-center gap-2 p-2 pl-4 focus-within:ring-2 focus-within:ring-emerald-600`}
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
              className="min-w-0 flex-1 bg-transparent py-1.5 font-mono text-sm outline-none"
              placeholder={`${provider.name} API key`}
              aria-label="API key"
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
            />
            <button type="submit" disabled={!keyDraft.trim()} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">Save key</button>
          </form>
        )}
      </div>

      {keyMismatch && (
        <p className="text-sm text-amber-800">
          This key will not be used with {provider.name}. Remove it to add a {provider.name} key, or switch back to {getProvider(keyStatus?.savedFor ?? '').name}.
        </p>
      )}
      <button
        type="button"
        onClick={() => void test.run()}
        disabled={test.pending || (!keyStatus?.usableKey && !keyDraft.trim())}
        className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-slate-900 ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-40"
      >
        {test.pending ? 'Testing...' : 'Test connection'}
      </button>
      <ErrorNote message={save.error ?? test.error} />
      {message && <p role="status" className="text-sm text-emerald-800">{message}</p>}
    </div>
  );
}

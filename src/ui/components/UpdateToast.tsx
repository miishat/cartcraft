interface Props {
  needRefresh: boolean;
  offlineReady: boolean;
  onReload: () => void;
  onClose: () => void;
}

/** Non-blocking notice from the service worker, at the top so it never covers Build list or the undo toast. Never reloads by itself. */
export function UpdateToast({ needRefresh, offlineReady, onReload, onClose }: Props) {
  if (!needRefresh && !offlineReady) return null;
  return (
    <div role="status" className="fixed inset-x-4 top-16 z-40 mx-auto flex max-w-md items-center gap-3 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-lg">
      <p className="flex-1">{needRefresh ? 'A new version of CartCraft is available.' : 'CartCraft now works offline.'}</p>
      {needRefresh && (
        <button type="button" onClick={onReload} className="font-semibold text-emerald-300">Reload</button>
      )}
      <button type="button" onClick={onClose} className="text-slate-300">{needRefresh ? 'Later' : 'OK'}</button>
    </div>
  );
}

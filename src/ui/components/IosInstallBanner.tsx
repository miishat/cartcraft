import { useState } from 'react';

export const DISMISSED_KEY = 'cartcraft.iosInstallHintDismissed';

/** navigator.standalone exists only in iOS and iPadOS WebKit: false in a Safari tab, true when installed. */
function iosStandalone(): boolean | undefined {
  return (navigator as Navigator & { standalone?: boolean }).standalone;
}

/** Per device and browser on purpose, so it is kept out of settings (and out of backups). */
function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * iOS keeps Safari and Home Screen app storage apart, so recipes added in a Safari tab are
 * missing after installing. iOS has no install prompt, so this explains the manual steps.
 */
export function IosInstallBanner({ standalone = iosStandalone() }: { standalone?: boolean }) {
  const [dismissed, setDismissed] = useState(readDismissed);
  if (standalone !== false || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      // Storage blocked: the banner comes back next visit, which is harmless.
    }
  };

  return (
    <div role="note" className="mb-4 flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
      <p className="flex-1">
        On iPhone and iPad, Safari and the Home Screen app keep separate data. Install CartCraft first: tap Share, then
        Add to Home Screen, and add your recipes in the installed app.
      </p>
      <button type="button" onClick={dismiss} className="shrink-0 font-semibold">Got it</button>
    </div>
  );
}

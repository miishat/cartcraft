import { useRegisterSW } from 'virtual:pwa-register/react';
import { UpdateToast } from './components/UpdateToast';

const HOUR = 60 * 60 * 1000;

/** Registers the service worker and shows its notices. Only rendered by main.tsx (not in tests). */
export function PwaStatus() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Installed apps can stay open for days; look for a new version every hour.
      if (registration) setInterval(() => void registration.update().catch(() => undefined), HOUR);
    },
  });

  return (
    <UpdateToast
      needRefresh={needRefresh}
      offlineReady={offlineReady}
      onReload={() => void updateServiceWorker(true)}
      onClose={() => {
        setNeedRefresh(false);
        setOfflineReady(false);
      }}
    />
  );
}

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { DEFAULT_SETTINGS } from '../data/db';
import type { Aisle, Settings } from '../data/types';
import { useDb } from './db';

/** Live settings; falls back to defaults while loading. */
export function useSettings(): Settings {
  const db = useDb();
  return useLiveQuery(() => db.settings.get('settings'), [db]) ?? DEFAULT_SETTINGS;
}

/** Live aisles in shopping order; undefined while loading. */
export function useAisles(): Aisle[] | undefined {
  const db = useDb();
  return useLiveQuery(() => db.aisles.orderBy('order').toArray(), [db]);
}

/** How much this site stores, like "2.1 MB"; null until the browser answers, or when it cannot. */
export function useStorageUsage(): string | null {
  const [usage, setUsage] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    navigator.storage?.estimate?.()
      .then((e) => {
        if (live && e.usage !== undefined) setUsage(`${(e.usage / 1024 / 1024).toFixed(1)} MB`);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return usage;
}

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

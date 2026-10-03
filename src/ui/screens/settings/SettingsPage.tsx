import type { ReactNode } from 'react';
import { ScreenHeader } from '../../components/ScreenHeader';

export const CARD = 'overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200';
export const CARD_LIST = `${CARD} divide-y divide-slate-100`;
export const GROUP_LABEL = 'mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500';

/** The frame of every settings page: a way back, the title and an optional hint. */
export function SettingsPage({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <ScreenHeader title={title} back={{ to: '/settings', label: 'Settings' }} subtitle={hint} />
      {children}
    </div>
  );
}

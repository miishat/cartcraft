import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

export const CARD = 'overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200';
export const CARD_LIST = `${CARD} divide-y divide-slate-100`;
export const GROUP_LABEL = 'mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500';

/** The frame of every settings page: a way back, the title and an optional hint. */
export function SettingsPage({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <Link to="/settings" aria-label="Back to Settings" className="inline-flex items-center text-sm font-medium text-emerald-800 hover:underline">
          <ChevronLeft size={16} aria-hidden="true" />
          Settings
        </Link>
        <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-tight text-slate-900">{title}</h1>
        {hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import { TINT_CLASS, type Tint } from '../../tints';

interface Props {
  to: string;
  emoji: string;
  tint: Tint;
  title: string;
  summary?: string;
  value?: string;
}

/** One row on the Settings home: tap anywhere to open that page. */
export function SettingsRow({ to, emoji, tint, title, summary, value }: Props) {
  return (
    <li>
      <Link to={to} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
        <span aria-hidden="true" className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base leading-none ${TINT_CLASS[tint]}`}>
          {emoji}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-slate-900">{title}</span>
          {summary && <span className="block truncate text-sm text-slate-500">{summary}</span>}
        </span>
        {value && <span className="shrink-0 text-sm text-slate-500">{value}</span>}
        <ChevronRight size={18} className="shrink-0 text-slate-400" aria-hidden="true" />
      </Link>
    </li>
  );
}

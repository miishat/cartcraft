import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

/** The top of every screen: an optional way back, the title, and the screen's own actions. */
export function ScreenHeader({ title, back, subtitle, actions }: {
  title: ReactNode;
  back?: { to: string; label: string };
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="space-y-1">
      {back && (
        <Link to={back.to} aria-label={`Back to ${back.label}`} className="-ml-1 inline-flex items-center text-sm font-medium text-emerald-800 hover:underline">
          <ChevronLeft size={18} aria-hidden="true" />
          {back.label}
        </Link>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[28px] font-bold leading-tight tracking-tight text-slate-900">{title}</h1>
          {subtitle && <div className="mt-1 text-sm text-slate-500">{subtitle}</div>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/** How far through the shop you are. The width is set through React's style prop, which CSP allows. */
export function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="flex items-center gap-3 text-sm text-slate-500">
      <div
        role="progressbar"
        aria-label="Shopping progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200"
      >
        <div className="h-full rounded-full bg-emerald-600 transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
      <span className="shrink-0 tabular-nums">{done} of {total} in cart</span>
    </div>
  );
}

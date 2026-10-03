import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useIsPhone } from '../useIsPhone';

const CLOSE_DRAG_PX = 80;
const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"]), [role="menuitem"], [role="menuitemcheckbox"]';

/**
 * A panel that slides up from the bottom on phones and sits centred on wider screens.
 * Escape, a tap on the backdrop, or dragging the handle down closes it.
 */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const dragFrom = useRef<number | null>(null);

  const phone = useIsPhone();
  const phoneAtMount = useRef(phone);

  const latestClose = useRef(onClose);
  latestClose.current = onClose;

  useEffect(() => {
    // On phones, skip text fields so the keyboard does not pop up over the sheet.
    const fields = panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [];
    [...fields].find((el) => !(phoneAtMount.current && /^(INPUT|TEXTAREA)$/.test(el.tagName)))?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') latestClose.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-4">
      <div data-testid="sheet-backdrop" className="absolute inset-0 bg-slate-950/40 animate-[fade-in_150ms_ease-out]" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-white pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl animate-[sheet-up_200ms_ease-out] md:max-w-sm md:rounded-2xl md:pb-2 md:animate-none"
      >
        <div
          data-testid="sheet-handle"
          className="flex touch-none justify-center pb-1 pt-3 md:hidden"
          onPointerDown={(e) => {
            dragFrom.current = e.clientY;
          }}
          onPointerUp={(e) => {
            if (dragFrom.current !== null && e.clientY - dragFrom.current > CLOSE_DRAG_PX) onClose();
            dragFrom.current = null;
          }}
        >
          <span className="h-1.5 w-10 rounded-full bg-slate-300" />
        </div>
        <h2 id={titleId} className="px-5 pb-2 pt-2 text-base font-semibold text-slate-900 md:pt-4">{title}</h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}

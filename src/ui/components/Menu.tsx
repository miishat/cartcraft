import { MoreHorizontal } from 'lucide-react';
import {
  createContext, useCallback, useContext, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode,
} from 'react';
import { useIsPhone } from '../useIsPhone';
import { Sheet } from './Sheet';

const CloseMenu = createContext<() => void>(() => undefined);

const ITEM = 'flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left md:py-2.5 text-sm text-slate-800 hover:bg-slate-50 focus:bg-slate-100 focus:outline-none';
const ITEMS = '[role="menuitem"],[role="menuitemcheckbox"]';

/** A ⋯ button that opens a small menu card. Escape or a click outside closes it. */
export function Menu({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const phone = useIsPhone();

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    if (returnFocus) button.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>(ITEMS)?.focus();
    const onPointerDown = (e: PointerEvent | MouseEvent) => {
      const target = e.target as Node;
      if ((target as Element).closest?.('[role="dialog"]')) return;
      if (!menu.current?.contains(target) && !button.current?.contains(target)) close(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, close]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(menu.current?.querySelectorAll<HTMLElement>(ITEMS) ?? [])];
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[(index + 1) % items.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[(index - 1 + items.length) % items.length]?.focus();
    } else if (e.key === 'Tab') {
      close(false);
    }
  };

  const card = (
    <div
      ref={menu}
      id={menuId}
      role="menu"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={phone ? 'pb-1' : 'absolute right-0 top-full z-40 mt-2 w-64 overflow-hidden rounded-2xl bg-white py-1 shadow-lg ring-1 ring-slate-200'}
    >
      <CloseMenu.Provider value={close}>{children}</CloseMenu.Provider>
    </div>
  );

  return (
    <div className="relative">
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        className="rounded-xl bg-slate-100 p-2 text-slate-600 hover:bg-slate-200"
      >
        <MoreHorizontal size={18} aria-hidden="true" />
      </button>
      {open && (phone ? <Sheet title={label} onClose={() => close()}>{card}</Sheet> : card)}
    </div>
  );
}

/** A menu action. Closes the menu first, so a dialog it opens gets focus. */
export function MenuItem({ icon, onSelect, children }: { icon: string; onSelect: () => void; children: ReactNode }) {
  const close = useContext(CloseMenu);
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      className={ITEM}
      onClick={() => {
        close();
        onSelect();
      }}
    >
      <span aria-hidden="true">{icon}</span>
      {children}
    </button>
  );
}

/** An on/off menu item with a switch. Stays open so the change is visible. */
export function MenuCheckbox({ icon, checked, onChange, children }: {
  icon: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <button type="button" role="menuitemcheckbox" aria-checked={checked} tabIndex={-1} className={ITEM} onClick={() => onChange(!checked)}>
      <span aria-hidden="true">{icon}</span>
      <span className="flex-1">{children}</span>
      <span aria-hidden="true" className={`relative h-5 w-9 shrink-0 rounded-full ${checked ? 'bg-emerald-700' : 'bg-slate-300'}`}>
        <span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : ''}`} />
      </span>
    </button>
  );
}

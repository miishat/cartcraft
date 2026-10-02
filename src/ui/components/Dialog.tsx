import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';

interface DialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** A centred modal on a dimmed backdrop. Escape and a click on the backdrop close it. */
function Dialog({ title, onClose, children }: DialogProps) {
  const titleId = useId();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-semibold text-slate-900">{title}</h2>
        {children}
      </div>
    </div>
  );
}

const CANCEL = 'cursor-pointer rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100';

interface ConfirmProps {
  title: string;
  message?: string;
  confirmLabel: string;
  /** Styles the confirm button as destructive. */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ title, message, confirmLabel, danger = false, onConfirm, onCancel }: ConfirmProps) {
  return (
    <Dialog title={title} onClose={onCancel}>
      {message && <p className="text-sm text-slate-600">{message}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={CANCEL}>Cancel</button>
        <button
          type="button"
          autoFocus
          onClick={onConfirm}
          className={`cursor-pointer rounded-lg px-4 py-2 text-sm font-medium text-white ${danger ? 'bg-red-700' : 'bg-slate-900'}`}
        >
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}

interface PromptProps {
  title: string;
  label: string;
  initialValue: string;
  confirmLabel: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

export function PromptDialog({ title, label, initialValue, confirmLabel, onSubmit, onCancel }: PromptProps) {
  const [value, setValue] = useState(initialValue);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (value.trim()) onSubmit(value);
  };
  return (
    <Dialog title={title} onClose={onCancel}>
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm font-medium text-slate-700">
          {label}
          <input
            autoFocus
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-normal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
          />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className={CANCEL}>Cancel</button>
          <button type="submit" disabled={!value.trim()} className="cursor-pointer rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
            {confirmLabel}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

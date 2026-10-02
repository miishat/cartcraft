import { GripVertical } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { moveAisleTo, renameAisle } from '../../../app/settings';
import { AisleBadge } from '../../components/AisleBadge';
import { ErrorNote } from '../../components/ErrorNote';
import { useDb } from '../../db';
import { useAisles } from '../../hooks';
import { useAsyncAction } from '../../useAsyncAction';
import { dropIndex, rowShift } from './aisleDrag';
import { CARD_LIST, SettingsPage } from './SettingsPage';

/** Used when the browser reports no height (tests); real rows are measured. */
const FALLBACK_ROW_HEIGHT = 48;

interface Drag {
  id: string;
  from: number;
  startY: number;
  offset: number;
  rowHeight: number;
}

export function AislesPage() {
  const db = useDb();
  const aisles = useAisles();
  const action = useAsyncAction((fn: () => Promise<void>) => fn(), 'Could not update aisles. Try again.');
  const [drag, setDrag] = useState<Drag | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const handles = useRef(new Map<string, HTMLButtonElement>());
  const refocus = useRef<string | null>(null);
  const hintId = useId();

  // Keeps keyboard focus on the handle after its row moves.
  useEffect(() => {
    if (refocus.current) handles.current.get(refocus.current)?.focus();
    refocus.current = null;
  }, [aisles]);

  if (!aisles) return null;
  const count = aisles.length;

  const move = (id: string, name: string, to: number) => {
    const target = Math.min(Math.max(0, to), count - 1);
    void action.run(async () => {
      await moveAisleTo(db, id, target);
      setAnnouncement(`${name} moved to position ${target + 1} of ${count}`);
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, id: string, name: string, index: number) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const to = index + (e.key === 'ArrowUp' ? -1 : 1);
    if (to < 0 || to >= count) return;
    refocus.current = id;
    move(id, name, to);
  };

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>, id: string, index: number) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const rowHeight = e.currentTarget.closest('li')?.offsetHeight || FALLBACK_ROW_HEIGHT;
    setDrag({ id, from: index, startY: e.clientY, offset: 0, rowHeight });
  };

  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    setDrag((d) => (d ? { ...d, offset: e.clientY - d.startY } : d));
  };

  const onPointerUp = (name: string) => {
    if (!drag) return;
    const to = dropIndex(drag.from, drag.offset, drag.rowHeight, count);
    setDrag(null);
    if (to !== drag.from) move(drag.id, name, to);
  };

  const target = drag ? dropIndex(drag.from, drag.offset, drag.rowHeight, count) : -1;

  return (
    <SettingsPage title="Aisles" hint="Lists follow this order. Drag to match your store, tap a name to rename.">
      <p id={hintId} className="sr-only">Use the arrow keys to move an aisle up or down.</p>
      <ol className={CARD_LIST}>
        {aisles.map((aisle, index) => {
          const dragged = drag?.id === aisle.id;
          const shift = drag && !dragged ? rowShift(index, drag.from, target, drag.rowHeight) : 0;
          const y = dragged ? drag.offset : shift;
          return (
            <li
              key={aisle.id}
              style={drag ? { transform: `translateY(${y}px)` } : undefined}
              className={`relative flex items-center gap-3 bg-white px-3 py-2 ${dragged ? 'z-10 shadow-lg ring-1 ring-slate-200' : ''} ${drag && !dragged ? 'transition-transform' : ''}`}
            >
              <AisleBadge aisleId={aisle.id} />
              <input
                className="min-w-0 flex-1 rounded-lg bg-transparent px-2 py-1.5 font-medium text-slate-900 hover:bg-slate-50 focus:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                defaultValue={aisle.name}
                aria-label={`Name of ${aisle.name}`}
                onBlur={(e) => {
                  const name = e.target.value.trim();
                  if (!name) e.target.value = aisle.name;
                  else if (name !== aisle.name) void action.run(() => renameAisle(db, aisle.id, name));
                }}
              />
              <button
                type="button"
                ref={(el) => {
                  if (el) handles.current.set(aisle.id, el);
                  else handles.current.delete(aisle.id);
                }}
                aria-label={`Reorder ${aisle.name}`}
                aria-describedby={hintId}
                onKeyDown={(e) => onKeyDown(e, aisle.id, aisle.name, index)}
                onPointerDown={(e) => onPointerDown(e, aisle.id, index)}
                onPointerMove={onPointerMove}
                onPointerUp={() => onPointerUp(aisle.name)}
                onPointerCancel={() => setDrag(null)}
                className="cursor-grab touch-none rounded-lg p-2 text-slate-400 hover:bg-slate-100 active:cursor-grabbing"
              >
                <GripVertical size={18} aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ol>
      <p aria-live="polite" className="sr-only">{announcement}</p>
      <ErrorNote message={action.error} />
    </SettingsPage>
  );
}

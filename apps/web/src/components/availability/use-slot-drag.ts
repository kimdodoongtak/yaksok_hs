"use client";
import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction, type RefObject, type PointerEvent } from "react";
import { addDays, slotAt } from "./calendar";

type Drag = {
  pointerId: number;
  day: string;
  minute: number;
  value: boolean;
  base: Set<string>;
  x: number;
  y: number;
  lastSlot?: string;
};
export function useSlotDrag(
  grid: RefObject<HTMLDivElement | null>,
  draft: Set<string>,
  setDraft: Dispatch<SetStateAction<Set<string>>>,
  canEdit: (day: string, minute: number) => boolean,
  onEdit: () => void,
  stepMinutes = 30,
) {
  const drag = useRef<Drag | null>(null);
  const frame = useRef<number | null>(null);
  const cancelDrag = useCallback((restore = false) => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    if (restore && drag.current) setDraft(drag.current.base);
    drag.current = null;
  }, [setDraft]);
  useEffect(() => {
    const blur = () => cancelDrag(true);
    window.addEventListener("blur", blur);
    return () => { window.removeEventListener("blur", blur); cancelDrag(); };
  }, [cancelDrag]);

  function paint(day: string, minute: number) {
    const current = drag.current;
    if (!current || current.lastSlot === `${day}:${minute}`) return;
    current.lastSlot = `${day}:${minute}`;
    const next = new Set(current.base);
    const start = current.day < day ? current.day : day;
    const end = current.day > day ? current.day : day;
    for (let d = start; d <= end; d = addDays(d, 1)) {
      for (let m = Math.min(current.minute, minute); m < Math.max(current.minute, minute) + stepMinutes; m += 30) {
        if (!canEdit(d, m)) continue;
        const slot = slotAt(d, m);
        if (current.value) next.add(slot); else next.delete(slot);
      }
    }
    setDraft(next);
  }
  function visibleBottom(container: HTMLDivElement) {
    const footer = container.parentElement?.querySelector<HTMLElement>("footer:not([hidden])");
    return Math.min(container.getBoundingClientRect().bottom, window.innerHeight, footer?.getBoundingClientRect().top ?? Infinity);
  }
  function paintPoint() {
    const current = drag.current, container = grid.current;
    if (!current || !container) return;
    const box = container.getBoundingClientRect();
    if (current.x < box.left || current.x >= box.right) return;
    const header = container.parentElement?.querySelector<HTMLElement>("[data-calendar-controls]");
    const top = header?.getBoundingClientRect().bottom ?? box.top;
    const y = Math.max(top + 1, Math.min(visibleBottom(container) - 2, current.y));
    const cell = document.elementFromPoint(current.x, y)?.closest<HTMLButtonElement>("button[data-day][data-minute]");
    if (cell && container.contains(cell)) paint(cell.dataset.day!, Number(cell.dataset.minute));
  }
  function animate() {
    const current = drag.current, container = grid.current;
    if (!current || !container) return;
    const box = container.getBoundingClientRect();
    const top = container.parentElement?.querySelector<HTMLElement>("[data-calendar-controls]")?.getBoundingClientRect().bottom ?? box.top;
    if (current.x >= box.left && current.x <= box.right) {
      if (current.y > visibleBottom(container) - 28) window.scrollBy(0, 7);
      else if (current.y < top + 20) window.scrollBy(0, -7);
    }
    paintPoint();
    frame.current = requestAnimationFrame(animate);
  }
  function start(event: PointerEvent<HTMLButtonElement>, day: string, minute: number) {
    const editableMinutes = Array.from({length: stepMinutes / 30}, (_, i) => minute + i * 30).filter(m => canEdit(day, m));
    if (!event.isPrimary || event.button !== 0 || !editableMinutes.length) return;
    cancelDrag();
    drag.current = {pointerId: event.pointerId, day, minute, value: !editableMinutes.every(m => draft.has(slotAt(day, m))), base: new Set(draft), x: event.clientX, y: event.clientY};
    grid.current?.setPointerCapture(event.pointerId);
    event.currentTarget.focus({preventScroll: true});
    onEdit();
    paint(day, minute);
    frame.current = requestAnimationFrame(animate);
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    drag.current.x = event.clientX; drag.current.y = event.clientY;
    paintPoint();
  }
  function finish(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    move(event);
    cancelDrag();
  }
  return {start, cancelDrag, handlers: {
    onPointerMove: move,
    onPointerUp: finish,
    onPointerCancel: () => cancelDrag(true),
    onLostPointerCapture: () => cancelDrag(true),
  }};
}

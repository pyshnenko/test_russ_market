import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent, type RefObject } from "react";

export type DragSource = { kind: "cell"; key: string } | { kind: "template"; id: string };

function scrollStep(position: number, start: number, end: number) {
  const edge = Math.min(40, (end - start) / 2);
  if (position < start + edge) return -10;
  if (position > end - edge) return 10;
  return 0;
}

export function useScheduleDrag(
  grid: RefObject<HTMLDivElement | null>,
  disabled: boolean,
  onDrop: (source: DragSource, key: string) => void,
) {
  const [dragSource, setDragSource] = useState<DragSource | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const preview = useRef<HTMLDivElement>(null);
  const stop = useRef<(() => void) | null>(null);
  const suppressClick = useRef(false);
  const drop = useRef(onDrop);

  useLayoutEffect(() => { drop.current = onDrop; }, [onDrop]);
  useEffect(() => () => stop.current?.(), []);
  useEffect(() => { if (disabled) stop.current?.(); }, [disabled]);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!event.isPrimary || event.button !== 0) return;
    stop.current?.();
    suppressClick.current = false;
    if (disabled || event.pointerType === "touch" || !(event.target instanceof Element)) return;

    const button = event.target.closest<HTMLButtonElement>("button[data-shift-source], button[data-template-source]");
    const layer = preview.current;
    const viewport = grid.current;
    if (!button || button.disabled || !layer || !viewport) return;

    const key = button.dataset.shiftSource;
    const id = button.dataset.templateSource;
    const source: DragSource | null = key ? { kind: "cell", key } : id ? { kind: "template", id } : null;
    if (!source) return;

    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    let x = startX;
    let y = startY;
    let dragging = false;
    let frame = 0;
    let target: string | null = null;

    function hitTest() {
      const cell = document.elementFromPoint(x, y)?.closest<HTMLTableCellElement>("td[data-shift-drop-key]");
      const next = cell && viewport?.contains(cell) ? cell.dataset.shiftDropKey : undefined;
      return next && next !== key ? next : null;
    }

    function highlight() {
      const next = hitTest();
      if (next === target) return;
      target = next;
      setDropTarget(next);
    }

    function scrollGrid() {
      if (!viewport) return;
      const { left, right, top, bottom } = viewport.getBoundingClientRect();
      if (x >= left && x <= right && y >= top && y <= bottom) {
        const dx = scrollStep(x, left, right);
        const dy = scrollStep(y, top, bottom);
        if (dx || dy) viewport.scrollBy(dx, dy);
      }
      frame = window.requestAnimationFrame(scrollGrid);
    }

    function finish() {
      stop.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", cancelPointer);
      window.removeEventListener("keydown", cancelOnEscape, true);
      window.removeEventListener("blur", finish);
      viewport?.removeEventListener("scroll", highlight);
      if (!dragging) return;

      window.cancelAnimationFrame(frame);
      if (button?.hasPointerCapture(pointerId)) button.releasePointerCapture(pointerId);
      document.documentElement.removeAttribute("data-schedule-dragging");
      if (layer) {
        layer.hidden = true;
        layer.replaceChildren();
      }
      setDragSource(null);
      setDropTarget(null);
    }

    function move(current: PointerEvent) {
      if (current.pointerId !== pointerId || !button || !layer) return;
      if ((current.buttons & 1) === 0) {
        finish();
        return;
      }
      x = current.clientX;
      y = current.clientY;
      if (!dragging) {
        if (Math.hypot(x - startX, y - startY) < 6 || !button.isConnected) return;
        dragging = true;
        suppressClick.current = true;
        button.setPointerCapture(pointerId);
        const { left, top, width } = button.getBoundingClientRect();
        layer.style.width = `${width}px`;
        layer.style.left = `${left - startX}px`;
        layer.style.top = `${top - startY}px`;
        layer.replaceChildren(button.cloneNode(true));
        layer.hidden = false;
        document.documentElement.setAttribute("data-schedule-dragging", "");
        setDragSource(source);
        viewport?.addEventListener("scroll", highlight);
        frame = window.requestAnimationFrame(scrollGrid);
      }
      layer.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      highlight();
    }

    function release(current: PointerEvent) {
      if (current.pointerId !== pointerId) return;
      x = current.clientX;
      y = current.clientY;
      const destination = dragging ? hitTest() : null;
      finish();
      if (source && destination) drop.current(source, destination);
    }

    function cancelPointer(current: PointerEvent) {
      if (current.pointerId === pointerId) finish();
    }

    function cancelOnEscape(current: KeyboardEvent) {
      if (current.key !== "Escape" || !dragging) return;
      current.preventDefault();
      current.stopPropagation();
      finish();
    }

    stop.current = finish;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", cancelPointer);
    window.addEventListener("keydown", cancelOnEscape, true);
    window.addEventListener("blur", finish);
  }

  function onClickCapture(event: MouseEvent<HTMLDivElement>) {
    if (!suppressClick.current || event.detail === 0) return;
    suppressClick.current = false;
    event.preventDefault();
    event.stopPropagation();
  }

  return { dragSource, dropTarget, preview, onPointerDown, onClickCapture };
}

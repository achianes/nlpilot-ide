import { useCallback, useEffect, useRef, useState } from "react";

/** Persisted pane size (px). */
export function useSplitSize(key: string, initial: number): [number, (v: number) => void] {
  const [v, setV] = useState<number>(() => {
    const saved = Number(localStorage.getItem(`split:${key}`));
    return Number.isFinite(saved) && saved > 40 ? saved : initial;
  });
  useEffect(() => {
    localStorage.setItem(`split:${key}`, String(v));
  }, [key, v]);
  return [v, setV];
}

interface DragBarProps {
  dir: "v" | "h";               // v = vertical bar (resizes width), h = horizontal (height)
  size: number;                 // current pane size in px
  setSize: (v: number) => void;
  invert?: boolean;             // pane sits AFTER the bar (dragging left/up grows it)
  min?: number;
  max?: number;
}

/** Draggable divider between panes. */
export function DragBar({ dir, size, setSize, invert = false, min = 80, max = 2000 }: DragBarProps) {
  const start = useRef<{ pos: number; size: number } | null>(null);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    start.current = { pos: dir === "v" ? e.clientX : e.clientY, size };
    const onMove = (ev: MouseEvent) => {
      if (!start.current) return;
      const cur = dir === "v" ? ev.clientX : ev.clientY;
      let delta = cur - start.current.pos;
      if (invert) delta = -delta;
      setSize(Math.min(max, Math.max(min, start.current.size + delta)));
    };
    const onUp = () => {
      start.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = dir === "v" ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none"; // don't select text while dragging
  }, [dir, size, setSize, invert, min, max]);

  return <div className={`dragbar dragbar-${dir}`} onMouseDown={onMouseDown} />;
}

import { useCallback, useRef, useState } from "react";
import type { CanvasElement } from "./canvas-types";

/** Undo/redo history over the wireframe's element list. */
export function useCanvasHistory(initial: CanvasElement[] = []) {
  const [present, setPresent] = useState<CanvasElement[]>(initial);
  const past = useRef<CanvasElement[][]>([]);
  const future = useRef<CanvasElement[][]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const sync = useCallback(() => {
    setCanUndo(past.current.length > 0);
    setCanRedo(future.current.length > 0);
  }, []);

  /** Commits a new state, e.g. after a create/move/resize/delete finishes. */
  const commit = useCallback(
    (next: CanvasElement[]) => {
      past.current.push(present);
      if (past.current.length > 100) past.current.shift();
      future.current = [];
      setPresent(next);
      sync();
    },
    [present, sync]
  );

  const undo = useCallback(() => {
    if (past.current.length === 0) return;
    const prev = past.current.pop()!;
    future.current.push(present);
    setPresent(prev);
    sync();
  }, [present, sync]);

  const redo = useCallback(() => {
    if (future.current.length === 0) return;
    const next = future.current.pop()!;
    past.current.push(present);
    setPresent(next);
    sync();
  }, [present, sync]);

  const clear = useCallback(() => commit([]), [commit]);

  return { elements: present, commit, undo, redo, clear, canUndo, canRedo };
}

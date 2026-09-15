"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  Heading1,
  Type,
  Square,
  Image as ImageIcon,
  RectangleHorizontal,
  CreditCard,
  PanelsTopLeft,
  Minus,
  MousePointer2,
  Trash2,
  Undo2,
  Redo2,
  Eraser,
  type LucideIcon,
} from "lucide-react";
import { useCanvasHistory } from "@/lib/use-canvas-history";
import { elementToSvg, elementsToPngDataUrl } from "@/lib/export-canvas";
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  DEFAULT_SIZE,
  type CanvasElement,
  type ElementType,
} from "@/lib/canvas-types";

type Tool = "select" | ElementType;
type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const TOOLS: { type: ElementType; icon: LucideIcon; label: string }[] = [
  { type: "heading", icon: Heading1, label: "Heading" },
  { type: "text", icon: Type, label: "Text" },
  { type: "rectangle", icon: Square, label: "Container" },
  { type: "image", icon: ImageIcon, label: "Image" },
  { type: "button", icon: RectangleHorizontal, label: "Button" },
  { type: "card", icon: CreditCard, label: "Card" },
  { type: "tabs", icon: PanelsTopLeft, label: "Tabs" },
  { type: "line", icon: Minus, label: "Line" },
];

const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function resizeElement(o: CanvasElement, handle: Handle, dx: number, dy: number): CanvasElement {
  const minSize = 16;
  let { x, y, w, h } = o;
  if (handle.includes("e")) w = clamp(o.w + dx, minSize, CANVAS_WIDTH - o.x);
  if (handle.includes("s")) h = clamp(o.h + dy, minSize, CANVAS_HEIGHT - o.y);
  if (handle.includes("w")) {
    const newW = clamp(o.w - dx, minSize, o.x + o.w);
    x = o.x + o.w - newW;
    w = newW;
  }
  if (handle.includes("n")) {
    const newH = clamp(o.h - dy, minSize, o.y + o.h);
    y = o.y + o.h - newH;
    h = newH;
  }
  return { ...o, x, y, w, h };
}

type Interaction =
  | { kind: "create"; type: ElementType; id: string; startX: number; startY: number }
  | { kind: "move"; id: string; startX: number; startY: number; origin: CanvasElement }
  | { kind: "resize"; id: string; handle: Handle; startX: number; startY: number; origin: CanvasElement };

export interface DrawCanvasHandle {
  exportPng(): Promise<string>;
  isEmpty(): boolean;
}

const LABEL_SUPPORTED: ElementType[] = ["heading", "text", "rectangle", "image", "button", "card"];

export const DrawCanvas = forwardRef<DrawCanvasHandle>(function DrawCanvas(_props, ref) {
  const history = useCanvasHistory([]);
  const elements = history.elements;

  const [tool, setTool] = useState<Tool>("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CanvasElement[] | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const interactionRef = useRef<Interaction | null>(null);
  const draftRef = useRef<CanvasElement[] | null>(null);

  const visible = draft ?? elements;
  const selected = visible.find((e) => e.id === selectedId) ?? null;

  useImperativeHandle(ref, () => ({
    exportPng: () => elementsToPngDataUrl(elements, CANVAS_WIDTH, CANVAS_HEIGHT),
    isEmpty: () => elements.length === 0,
  }));

  const getPoint = useCallback((e: PointerEvent | React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: clamp(e.clientX - rect.left, 0, CANVAS_WIDTH),
      y: clamp(e.clientY - rect.top, 0, CANVAS_HEIGHT),
    };
  }, []);

  const endInteraction = useCallback(() => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    interactionRef.current = null;
    const finalEls = draftRef.current;
    draftRef.current = null;
    setDraft(null);
    if (finalEls) history.commit(finalEls);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history]);

  const onMove = useCallback(
    (e: PointerEvent) => {
      const interaction = interactionRef.current;
      if (!interaction) return;
      const p = getPoint(e);
      const base = draftRef.current;
      if (!base) return;
      const next = base.map((el) => {
        if (el.id !== interaction.id) return el;
        if (interaction.kind === "create") {
          const x = Math.min(interaction.startX, p.x);
          const y = Math.min(interaction.startY, p.y);
          return { ...el, x, y, w: Math.abs(p.x - interaction.startX), h: Math.abs(p.y - interaction.startY) };
        }
        if (interaction.kind === "move") {
          const dx = p.x - interaction.startX;
          const dy = p.y - interaction.startY;
          return {
            ...el,
            x: clamp(interaction.origin.x + dx, 0, CANVAS_WIDTH - interaction.origin.w),
            y: clamp(interaction.origin.y + dy, 0, CANVAS_HEIGHT - interaction.origin.h),
          };
        }
        return resizeElement(interaction.origin, interaction.handle, p.x - interaction.startX, p.y - interaction.startY);
      });
      draftRef.current = next;
      setDraft(next);
    },
    [getPoint]
  );

  const onUp = useCallback(() => {
    const interaction = interactionRef.current;
    if (interaction?.kind === "create") {
      const created = draftRef.current?.find((el) => el.id === interaction.id);
      if (created && (created.w < 8 || created.h < 8)) {
        const def = DEFAULT_SIZE[interaction.type];
        const w = Math.min(def.w, CANVAS_WIDTH - interaction.startX);
        const h = Math.min(def.h, CANVAS_HEIGHT - interaction.startY);
        draftRef.current =
          draftRef.current?.map((el) => (el.id === interaction.id ? { ...el, w, h } : el)) ?? null;
      }
      setSelectedId(interaction.id);
      setTool("select");
    }
    endInteraction();
  }, [endInteraction]);

  const beginInteraction = useCallback(
    (interaction: Interaction, base: CanvasElement[]) => {
      interactionRef.current = interaction;
      draftRef.current = base;
      setDraft(base);
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp, { once: true });
    },
    [onMove, onUp]
  );

  const handleCanvasPointerDown = (e: React.PointerEvent) => {
    if (e.target !== canvasRef.current) return;
    if (tool === "select") {
      setSelectedId(null);
      return;
    }
    const p = getPoint(e);
    const id = crypto.randomUUID();
    const newEl: CanvasElement = {
      id,
      type: tool,
      x: p.x,
      y: p.y,
      w: 0,
      h: 0,
      ...(tool === "tabs" ? { tabCount: 3 } : {}),
    };
    beginInteraction({ kind: "create", type: tool, id, startX: p.x, startY: p.y }, [...elements, newEl]);
  };

  const handleElementPointerDown = (e: React.PointerEvent, el: CanvasElement) => {
    if (tool !== "select") return;
    e.stopPropagation();
    setSelectedId(el.id);
    const p = getPoint(e);
    beginInteraction({ kind: "move", id: el.id, startX: p.x, startY: p.y, origin: el }, elements);
  };

  const handleHandlePointerDown = (e: React.PointerEvent, el: CanvasElement, handle: Handle) => {
    e.stopPropagation();
    const p = getPoint(e);
    beginInteraction({ kind: "resize", id: el.id, handle, startX: p.x, startY: p.y, origin: el }, elements);
  };

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    history.commit(elements.filter((el) => el.id !== selectedId));
    setSelectedId(null);
  }, [elements, history, selectedId]);

  const updateSelected = (patch: Partial<CanvasElement>) => {
    if (!selectedId) return;
    history.commit(elements.map((el) => (el.id === selectedId ? { ...el, ...patch } : el)));
  };

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        deleteSelected();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) history.redo();
        else history.undo();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        history.redo();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteSelected, history, selectedId]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-white p-2 shadow-panel">
        <button
          type="button"
          onClick={() => setTool("select")}
          title="Select"
          className={`flex h-9 w-9 items-center justify-center rounded-lg transition ${
            tool === "select" ? "bg-brand-100 text-brand-700" : "text-ink-muted hover:bg-surface-sunken"
          }`}
        >
          <MousePointer2 size={17} />
        </button>
        <div className="mx-1 h-6 w-px bg-border" />
        {TOOLS.map(({ type, icon: Icon, label }) => (
          <button
            key={type}
            type="button"
            onClick={() => setTool(type)}
            title={label}
            className={`flex h-9 w-9 items-center justify-center rounded-lg transition ${
              tool === type ? "bg-brand-100 text-brand-700" : "text-ink-muted hover:bg-surface-sunken"
            }`}
          >
            <Icon size={17} />
          </button>
        ))}
        <div className="mx-1 h-6 w-px bg-border" />
        <button
          type="button"
          onClick={history.undo}
          disabled={!history.canUndo}
          title="Undo"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted transition hover:bg-surface-sunken disabled:opacity-30"
        >
          <Undo2 size={17} />
        </button>
        <button
          type="button"
          onClick={history.redo}
          disabled={!history.canRedo}
          title="Redo"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted transition hover:bg-surface-sunken disabled:opacity-30"
        >
          <Redo2 size={17} />
        </button>
        <button
          type="button"
          onClick={deleteSelected}
          disabled={!selectedId}
          title="Delete selected"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted transition hover:bg-surface-sunken disabled:opacity-30"
        >
          <Trash2 size={17} />
        </button>
        <button
          type="button"
          onClick={() => {
            if (elements.length === 0) return;
            history.clear();
            setSelectedId(null);
          }}
          disabled={elements.length === 0}
          title="Clear canvas"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted transition hover:bg-surface-sunken disabled:opacity-30"
        >
          <Eraser size={17} />
        </button>
      </div>

      <div className="flex items-start gap-3">
        <div
          ref={canvasRef}
          onPointerDown={handleCanvasPointerDown}
          className="relative select-none overflow-hidden rounded-xl border border-border bg-white shadow-panel"
          style={{
            width: CANVAS_WIDTH,
            height: CANVAS_HEIGHT,
            maxWidth: "100%",
            backgroundImage: "radial-gradient(#EDE9F6 1px, transparent 1px)",
            backgroundSize: "20px 20px",
            cursor: tool === "select" ? "default" : "crosshair",
          }}
        >
          {visible.map((el) => (
            <div
              key={el.id}
              onPointerDown={(e) => handleElementPointerDown(e, el)}
              style={{
                position: "absolute",
                left: el.x,
                top: el.y,
                width: Math.max(el.w, 1),
                height: Math.max(el.h, 1),
                cursor: tool === "select" ? "move" : "default",
              }}
            >
              <svg
                width={el.w}
                height={el.h}
                viewBox={`0 0 ${el.w} ${el.h}`}
                style={{ display: "block", overflow: "visible" }}
                dangerouslySetInnerHTML={{ __html: elementToSvg({ ...el, x: 0, y: 0 }) }}
              />
              {selectedId === el.id && tool === "select" && (
                <>
                  <div className="pointer-events-none absolute inset-0 rounded-[2px] ring-2 ring-brand-500" />
                  {HANDLES.map((h) => (
                    <div
                      key={h}
                      onPointerDown={(e) => handleHandlePointerDown(e, el, h)}
                      className="absolute h-2.5 w-2.5 rounded-full border-2 border-brand-500 bg-white"
                      style={handleStyle(h)}
                    />
                  ))}
                </>
              )}
            </div>
          ))}
          {elements.length === 0 && !draft && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-ink-muted">
              Pick a shape above, then click and drag on the canvas to draw it.
            </div>
          )}
        </div>

        {selected && (
          <div className="w-56 shrink-0 rounded-xl border border-border bg-white p-3 shadow-panel">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              {selected.type}
            </p>
            {LABEL_SUPPORTED.includes(selected.type) && (
              <label className="block text-xs text-ink-muted">
                Label / content
                <textarea
                  key={selected.id}
                  defaultValue={selected.label ?? ""}
                  onBlur={(e) => updateSelected({ label: e.target.value })}
                  rows={selected.type === "text" ? 3 : 1}
                  className="mt-1 w-full resize-none rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-brand-400 focus:outline-none"
                />
              </label>
            )}
            {selected.type === "tabs" && (
              <label className="mt-2 block text-xs text-ink-muted">
                Number of tabs
                <input
                  type="number"
                  min={2}
                  max={6}
                  key={selected.id}
                  defaultValue={selected.tabCount ?? 3}
                  onBlur={(e) => updateSelected({ tabCount: clamp(Number(e.target.value) || 3, 2, 6) })}
                  className="mt-1 w-full rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-brand-400 focus:outline-none"
                />
              </label>
            )}
            <button
              type="button"
              onClick={deleteSelected}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-border py-1.5 text-xs font-medium text-ink-soft transition hover:bg-surface-sunken"
            >
              <Trash2 size={13} /> Delete element
            </button>
          </div>
        )}
      </div>
    </div>
  );
});

function handleStyle(h: Handle): React.CSSProperties {
  const pos: React.CSSProperties = { transform: "translate(-50%, -50%)" };
  if (h.includes("n")) pos.top = 0;
  if (h.includes("s")) pos.top = "100%";
  if (!h.includes("n") && !h.includes("s")) pos.top = "50%";
  if (h.includes("w")) pos.left = 0;
  if (h.includes("e")) pos.left = "100%";
  if (!h.includes("w") && !h.includes("e")) pos.left = "50%";
  const cursors: Record<Handle, string> = {
    n: "ns-resize",
    s: "ns-resize",
    e: "ew-resize",
    w: "ew-resize",
    ne: "nesw-resize",
    sw: "nesw-resize",
    nw: "nwse-resize",
    se: "nwse-resize",
  };
  pos.cursor = cursors[h];
  return pos;
}

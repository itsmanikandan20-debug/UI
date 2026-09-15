// Element model for the Draw-mode wireframe editor.

export type ElementType =
  | "heading"
  | "text"
  | "rectangle"
  | "image"
  | "button"
  | "card"
  | "tabs"
  | "line";

export interface CanvasElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
  tabCount?: number;
}

export const CANVAS_WIDTH = 1000;
export const CANVAS_HEIGHT = 640;

export const DEFAULT_SIZE: Record<ElementType, { w: number; h: number }> = {
  heading: { w: 220, h: 36 },
  text: { w: 260, h: 64 },
  rectangle: { w: 220, h: 140 },
  image: { w: 220, h: 150 },
  button: { w: 130, h: 40 },
  card: { w: 220, h: 180 },
  tabs: { w: 320, h: 44 },
  line: { w: 240, h: 2 },
};

export const ELEMENT_LABELS: Record<ElementType, string> = {
  heading: "Heading",
  text: "Text",
  rectangle: "Container",
  image: "Image",
  button: "Button",
  card: "Card",
  tabs: "Tabs",
  line: "Line",
};

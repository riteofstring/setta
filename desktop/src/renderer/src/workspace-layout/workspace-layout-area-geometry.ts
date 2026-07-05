import type { Rect } from "./types";

export function viewportRect(element: HTMLElement, reservedLeftWidth = 0): Rect {
  const rect = element.getBoundingClientRect();
  const reservedWidth = Math.max(0, Math.min(rect.width - 1, reservedLeftWidth));
  return {
    height: rect.height,
    width: rect.width - reservedWidth,
    x: reservedWidth,
    y: 0,
  };
}

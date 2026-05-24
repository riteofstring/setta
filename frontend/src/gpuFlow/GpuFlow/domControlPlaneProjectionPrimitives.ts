import type { GpuRect } from "../viewportMath";

export function intersectRects(left: GpuRect, right: GpuRect): GpuRect {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const rightEdge = Math.min(left.x + left.width, right.x + right.width);
  const bottomEdge = Math.min(left.y + left.height, right.y + right.height);
  return {
    height: Math.max(0, bottomEdge - y),
    width: Math.max(0, rightEdge - x),
    x,
    y,
  };
}

export function rectsIntersect(left: GpuRect, right: GpuRect): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}

export function setStyleValue(
  element: HTMLElement,
  property:
    | "display"
    | "height"
    | "left"
    | "pointerEvents"
    | "top"
    | "transform"
    | "transformOrigin"
    | "width"
    | "zIndex",
  value: string,
): number {
  if (element.style[property] === value) {
    return 0;
  }
  element.style[property] = value;
  return 1;
}

import type { GpuRect } from "./viewportMath";

export function sortedStringsEqual(
  left: readonly string[],
  right: readonly string[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

export function rectKey(rect: GpuRect): string {
  return `${rect.x}:${rect.y}:${rect.width}:${rect.height}`;
}

export function freezeRect(rect: GpuRect): GpuRect {
  return Object.freeze({ ...rect });
}

export function intersectRects(left: GpuRect, right: GpuRect): GpuRect | null {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const width = Math.max(
    0,
    Math.min(left.x + left.width, right.x + right.width) - x,
  );
  const height = Math.max(
    0,
    Math.min(left.y + left.height, right.y + right.height) - y,
  );
  return width > 0 && height > 0 ? { height, width, x, y } : null;
}

export function subtractRect(
  rect: GpuRect,
  cutout: GpuRect,
): readonly GpuRect[] {
  const intersection = intersectRects(rect, cutout);
  if (!intersection) {
    return [rect];
  }
  const rectRight = rect.x + rect.width;
  const rectBottom = rect.y + rect.height;
  const cutoutRight = intersection.x + intersection.width;
  const cutoutBottom = intersection.y + intersection.height;
  return [
    {
      height: intersection.y - rect.y,
      width: rect.width,
      x: rect.x,
      y: rect.y,
    },
    {
      height: rectBottom - cutoutBottom,
      width: rect.width,
      x: rect.x,
      y: cutoutBottom,
    },
    {
      height: intersection.height,
      width: intersection.x - rect.x,
      x: rect.x,
      y: intersection.y,
    },
    {
      height: intersection.height,
      width: rectRight - cutoutRight,
      x: cutoutRight,
      y: intersection.y,
    },
  ].filter((fragment) => fragment.width > 0 && fragment.height > 0);
}

export function rectsEqual(left: GpuRect, right: GpuRect): boolean {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  );
}

export function rectArea(rect: GpuRect): number {
  return rect.width * rect.height;
}

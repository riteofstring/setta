import type { GpuRect } from "./viewportMath";

export function intersectCommittedSurfaceFrameRects(
  left: GpuRect,
  right: GpuRect,
): GpuRect {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const maxX = Math.min(left.x + left.width, right.x + right.width);
  const maxY = Math.min(left.y + left.height, right.y + right.height);
  return {
    height: Math.max(0, maxY - y),
    width: Math.max(0, maxX - x),
    x,
    y,
  };
}

export function isPositiveCommittedSurfaceRect(rect: GpuRect): boolean {
  return rect.width > 0 && rect.height > 0;
}

import type { GpuRect } from "./viewportMath";

export function createGpuRetainedContentLabelRect({
  controlRect,
  labelControlGap,
  labelX,
  rowRect,
  statusBadgeRect,
}: {
  readonly controlRect: GpuRect;
  readonly labelControlGap: number;
  readonly labelX: number;
  readonly rowRect: GpuRect;
  readonly statusBadgeRect?: GpuRect | null | undefined;
}): GpuRect {
  const rightEdge = statusBadgeRect
    ? statusBadgeRect.x - labelControlGap
    : controlRect.x - labelControlGap;
  return {
    height: rowRect.height,
    width: Math.max(0, rightEdge - labelX),
    x: labelX,
    y: rowRect.y,
  };
}

export function createGpuRetainedContentControlRect({
  controlWidth,
  rowRect,
}: {
  readonly controlWidth: number;
  readonly rowRect: GpuRect;
}): GpuRect {
  const width = Math.min(controlWidth, rowRect.width);
  return {
    height: rowRect.height,
    width,
    x: rowRect.x + rowRect.width - width,
    y: rowRect.y,
  };
}

import type { GpuRect } from "./viewportMath";

export function createGpuRetainedContentLabelRect({
  controlRect,
  labelControlGap,
  labelX,
  rowRect,
  statusBadgeRect,
}: {
  readonly controlRect?: GpuRect | null | undefined;
  readonly labelControlGap: number;
  readonly labelX: number;
  readonly rowRect: GpuRect;
  readonly statusBadgeRect?: GpuRect | null | undefined;
}): GpuRect {
  const rightEdge = statusBadgeRect
    ? statusBadgeRect.x - labelControlGap
    : controlRect
      ? controlRect.x - labelControlGap
      : rowRect.x + rowRect.width;
  return {
    height: rowRect.height,
    width: Math.max(0, rightEdge - labelX),
    x: labelX,
    y: rowRect.y,
  };
}

export function createGpuRetainedContentControlRect({
  controlWidth,
  rightInset = 0,
  rowRect,
}: {
  readonly controlWidth: number;
  readonly rightInset?: number | undefined;
  readonly rowRect: GpuRect;
}): GpuRect {
  const safeRightInset = Math.max(0, rightInset);
  const availableWidth = Math.max(0, rowRect.width - safeRightInset);
  const width = Math.min(controlWidth, availableWidth);
  return {
    height: rowRect.height,
    width,
    x: rowRect.x + rowRect.width - safeRightInset - width,
    y: rowRect.y,
  };
}

import type { GpuRect } from "./viewportMath";

export const GPU_RETAINED_CONTENT_ROW_TEXT_VALUE_INSET_LEFT = 14;

const GPU_RETAINED_CONTENT_NESTED_GUIDE_WIDTH_PX = 6;
const GPU_RETAINED_CONTENT_NESTED_GUIDE_OFFSET_X_PX = 1;
const GPU_RETAINED_CONTENT_NESTED_GUIDE_BLOCK_START_INSET_Y_PX = 6;

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

function createGpuRetainedContentControlRect({
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

export function createGpuRetainedContentRowControlRect({
  controlWidth,
  indentWidth,
  rightInset = 0,
  rowDepth,
  rowRect,
}: {
  readonly controlWidth: number;
  readonly indentWidth: number;
  readonly rightInset?: number | undefined;
  readonly rowDepth: number;
  readonly rowRect: GpuRect;
}): GpuRect {
  const controlRect = createGpuRetainedContentControlRect({
    controlWidth,
    rightInset,
    rowRect,
  });
  const depthInset = Math.min(
    controlRect.width,
    Math.max(0, rowDepth) * Math.max(0, indentWidth),
  );
  return {
    ...controlRect,
    width: Math.max(0, controlRect.width - depthInset),
    x: controlRect.x + depthInset,
  };
}

export function createGpuRetainedContentNestGuideRect({
  indentWidth,
  startsNestedBlock,
  rowDepth,
  rowRect,
}: {
  readonly indentWidth: number;
  readonly startsNestedBlock?: boolean | undefined;
  readonly rowDepth: number;
  readonly rowRect: GpuRect;
}): GpuRect {
  const topInset = startsNestedBlock
    ? Math.min(
        rowRect.height,
        GPU_RETAINED_CONTENT_NESTED_GUIDE_BLOCK_START_INSET_Y_PX,
      )
    : 0;
  return {
    height: Math.max(0, rowRect.height - topInset),
    width: GPU_RETAINED_CONTENT_NESTED_GUIDE_WIDTH_PX,
    x:
      rowRect.x +
      Math.max(0, rowDepth) * Math.max(0, indentWidth) +
      GPU_RETAINED_CONTENT_NESTED_GUIDE_OFFSET_X_PX,
    y: rowRect.y + topInset,
  };
}

import { adjustSizeToBeAtLeastMin } from "./sectionSizes";
import type { SectionSize } from "utils/generatedTypes";

export const SIZE_MODE = {
  any: "any",
  auto_only: "auto_only",
  manual_only: "manual_only",
};

type ResizeEndDecisionInput = {
  resizeStarted: boolean;
  resizeAttempted: boolean;
  isZeroDelta: boolean;
  isDoubleClick: boolean;
};

export function shouldEmitResizeEndEvent({
  resizeStarted,
  resizeAttempted,
  isZeroDelta,
  isDoubleClick,
}: ResizeEndDecisionInput): boolean {
  if (!resizeStarted) {
    return false;
  }
  if (isZeroDelta && !isDoubleClick && !resizeAttempted) {
    return false;
  }
  return true;
}

function clampNumericDimension(
  value: SectionSize["height"] | undefined,
  minValue: number,
) {
  return typeof value === "number" ? Math.max(value, minValue) : value;
}

export function clampChangedSize({
  changedSize,
  minHeight,
  minWidth,
  aspectRatio,
}: {
  changedSize: Partial<SectionSize>;
  minHeight: number;
  minWidth: number;
  aspectRatio: boolean;
}) {
  const { height, width } = changedSize;
  if (typeof height === "number" && typeof width === "number") {
    if (aspectRatio) {
      return adjustSizeToBeAtLeastMin(height, width, minHeight, minWidth);
    }
    return {
      height: Math.max(height, minHeight),
      width: Math.max(width, minWidth),
    };
  }
  return {
    ...changedSize,
    height: clampNumericDimension(height, minHeight),
    width: clampNumericDimension(width, minWidth),
  };
}

export function getResizeAxisAvailability({
  maxHeight,
  maxWidth,
  minHeight,
  minWidth,
  sizeMode,
}: {
  maxHeight: number;
  maxWidth: number;
  minHeight: number;
  minWidth: number;
  sizeMode: { width: string; height: string };
}) {
  return {
    heightResizable:
      minHeight !== maxHeight && sizeMode.height !== SIZE_MODE.auto_only,
    widthResizable:
      minWidth !== maxWidth && sizeMode.width !== SIZE_MODE.auto_only,
  };
}

export function getResizableEnable({
  disablePointerEvents,
  positionAndSizeLocked,
  heightResizable,
  widthResizable,
}: {
  disablePointerEvents: boolean;
  positionAndSizeLocked: boolean;
  heightResizable: boolean;
  widthResizable: boolean;
}) {
  if (disablePointerEvents || positionAndSizeLocked) {
    return false;
  }
  return {
    top: false,
    left: false,
    bottom: heightResizable,
    right: widthResizable,
    topRight: false,
    bottomRight: heightResizable && widthResizable,
    topLeft: false,
    bottomLeft: false,
  };
}

export function resolveResizableGrid({
  snapGrid,
  snapToGrid,
}: {
  snapGrid: readonly [number, number];
  snapToGrid: boolean;
}): readonly [number, number] | undefined {
  if (!snapToGrid) {
    return undefined;
  }
  const [xGrid, yGrid] = snapGrid;
  assertFinitePositiveResizeGridValue("snap grid x", xGrid);
  assertFinitePositiveResizeGridValue("snap grid y", yGrid);
  return snapGrid;
}

function assertFinitePositiveResizeGridValue(name: string, value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a finite positive number.`);
  }
}

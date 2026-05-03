import type { SectionSize } from "utils/generatedTypes";
import {
  adjustSizeToBeAtLeastMin,
  type ResizeHandleDirection,
} from "./sectionSizes";

export const SIZE_MODE = {
  any: "any",
  auto_only: "auto_only",
  manual_only: "manual_only",
};

const RESIZE_HANDLE_DOUBLE_CLICK_MS = 300;

type ResizeHandleClickState = {
  lastTimestampMs: number | null;
  lastDirection: ResizeHandleDirection | null;
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

export function getResizeHandleClickState({
  state,
  direction,
  timestampMs,
  thresholdMs = RESIZE_HANDLE_DOUBLE_CLICK_MS,
}: {
  state: ResizeHandleClickState;
  direction: ResizeHandleDirection;
  timestampMs: number;
  thresholdMs?: number;
}): { nextState: ResizeHandleClickState; isDoubleClick: boolean } {
  const isDoubleClick =
    state.lastTimestampMs !== null &&
    state.lastDirection === direction &&
    timestampMs - state.lastTimestampMs <= thresholdMs;

  return {
    isDoubleClick,
    nextState: {
      lastTimestampMs: timestampMs,
      lastDirection: direction,
    },
  };
}

export function isResizeDoubleClick({
  isPending,
  eventDetail,
  isZeroDelta,
  resizeAttempted,
}: {
  isPending: boolean;
  eventDetail?: number;
  isZeroDelta: boolean;
  resizeAttempted: boolean;
}): boolean {
  if (!isZeroDelta || resizeAttempted) {
    return false;
  }
  const eventDouble = typeof eventDetail === "number" && eventDetail === 2;
  return isPending || eventDouble;
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

type ManualSizeUpdate = {
  width?: number;
  height?: number;
};

type SingleClickSizeResolver = (input: {
  manualSize: ManualSizeUpdate;
  aspectRatio: boolean;
}) => ManualSizeUpdate;

function maybeAutoPx<TManual extends number | "auto">(
  autoDim: "auto",
  pxDim: TManual,
  sizeMode: string,
) {
  return sizeMode !== SIZE_MODE.manual_only ? autoDim : pxDim;
}

function canPersistManualSize(sizeMode: string): boolean {
  return sizeMode !== SIZE_MODE.auto_only;
}

function manualSizeUpdate({ width, height }: ManualSizeUpdate) {
  const nextSize: ManualSizeUpdate = {};
  if (width !== undefined) {
    nextSize.width = width;
  }
  if (height !== undefined) {
    nextSize.height = height;
  }
  return nextSize;
}

function getRightManualSizeUpdate({
  manualSize,
  aspectRatio,
}: {
  manualSize: ManualSizeUpdate;
  aspectRatio: boolean;
}) {
  const { width, height } = manualSize;
  if (width === undefined) {
    return {};
  }
  return aspectRatio
    ? manualSizeUpdate({
        width,
        ...(height !== undefined ? { height } : {}),
      })
    : { width };
}

function getBottomManualSizeUpdate({
  manualSize,
  aspectRatio,
}: {
  manualSize: ManualSizeUpdate;
  aspectRatio: boolean;
}) {
  const { width, height } = manualSize;
  if (height === undefined) {
    return {};
  }
  return aspectRatio
    ? manualSizeUpdate({
        ...(width !== undefined ? { width } : {}),
        height,
      })
    : { height };
}

const SINGLE_CLICK_SIZE_RESOLVERS: Partial<
  Record<ResizeHandleDirection, SingleClickSizeResolver>
> = {
  bottomRight: ({ manualSize }) => manualSizeUpdate(manualSize),
  right: getRightManualSizeUpdate,
  bottom: getBottomManualSizeUpdate,
};

function getDoubleClickResizeStopSize({
  direction,
  finalSize,
  sizeMode,
  aspectRatio,
}: {
  direction: ResizeHandleDirection;
  finalSize: { width: number; height: number };
  sizeMode: { width: string; height: string };
  aspectRatio: boolean;
}) {
  const autoWidth = maybeAutoPx("auto", finalSize.width, sizeMode.width);
  const autoHeight = maybeAutoPx("auto", finalSize.height, sizeMode.height);

  if (direction === "bottomRight") {
    return {
      width: autoWidth,
      height: autoHeight,
    };
  }
  if (direction === "right" && sizeMode.width) {
    return aspectRatio
      ? { width: autoWidth, height: autoHeight }
      : { width: autoWidth };
  }
  if (direction === "bottom" && sizeMode.height) {
    return aspectRatio
      ? { width: autoWidth, height: autoHeight }
      : { height: autoHeight };
  }
  return {};
}

function getSingleClickResizeStopSize({
  direction,
  finalSize,
  sizeMode,
  aspectRatio,
}: {
  direction: ResizeHandleDirection;
  finalSize: { width: number; height: number };
  sizeMode: { width: string; height: string };
  aspectRatio: boolean;
}) {
  const manualSize = manualSizeUpdate({
    ...(canPersistManualSize(sizeMode.width) ? { width: finalSize.width } : {}),
    ...(canPersistManualSize(sizeMode.height)
      ? { height: finalSize.height }
      : {}),
  });
  const resolveSize = SINGLE_CLICK_SIZE_RESOLVERS[direction];
  return resolveSize ? resolveSize({ manualSize, aspectRatio }) : {};
}

export function resolveSectionResizeStopSize({
  direction,
  finalSize,
  sizeMode,
  aspectRatio,
  isDoubleClick,
}: {
  direction: ResizeHandleDirection;
  finalSize: { width: number; height: number };
  sizeMode: { width: string; height: string };
  aspectRatio: boolean;
  isDoubleClick: boolean;
}): Partial<SectionSize> {
  return isDoubleClick
    ? getDoubleClickResizeStopSize({
        direction,
        finalSize,
        sizeMode,
        aspectRatio,
      })
    : getSingleClickResizeStopSize({
        direction,
        finalSize,
        sizeMode,
        aspectRatio,
      });
}

function assertFinitePositiveResizeGridValue(name: string, value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a finite positive number.`);
  }
}

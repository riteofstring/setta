import type { SectionSize } from "../../document/types.js";
import type { ResizeHandleDirection } from "../sectionSizes.js";

const RESIZE_HANDLE_DOUBLE_CLICK_MS = 300;

type ResizeHandleClickState = {
  lastTimestampMs: number | null;
  lastDirection: ResizeHandleDirection | null;
};

type ResizeStopEvent = {
  detail?: number;
};

type ResizeStopRef = {
  style: { width: string; height: string };
};

type ResizeDelta = {
  width: number;
  height: number;
};

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

function parseCurrPx(x: string): SectionSize["width"] {
  return x === "auto" ? x : parseInt(x);
}

function getDoubleClickSize(
  direction: ResizeHandleDirection,
): Partial<SectionSize> {
  if (direction === "bottomRight") {
    return { width: "auto", height: "auto" };
  }
  if (direction === "right") {
    return { width: "auto" };
  }
  if (direction === "bottom") {
    return { height: "auto" };
  }
  return {};
}

function getSingleClickSize(
  direction: ResizeHandleDirection,
  ref: ResizeStopRef,
): Partial<SectionSize> {
  const pxWidth = parseCurrPx(ref.style.width);
  const pxHeight = parseCurrPx(ref.style.height);

  if (direction === "bottomRight") {
    return { width: pxWidth, height: pxHeight };
  }
  if (direction === "right") {
    return { width: pxWidth };
  }
  if (direction === "bottom") {
    return { height: pxHeight };
  }
  return {};
}

export function getChangedSize({
  props,
  isDoubleClickOverride,
}: {
  props: [ResizeStopEvent, ResizeHandleDirection, ResizeStopRef, ResizeDelta];
  isDoubleClickOverride?: boolean;
}): Partial<SectionSize> {
  const [e, direction, ref, d] = props;
  const isDoubleClick =
    isDoubleClickOverride ??
    (d.width === 0 && d.height === 0 && e.detail === 2);
  if (isDoubleClick) {
    return getDoubleClickSize(direction);
  }
  return getSingleClickSize(direction, ref);
}

export function shouldEmitResizeEndEvent({
  resizeStarted,
  resizeAttempted,
  isZeroDelta,
  isDoubleClick,
}: {
  resizeStarted: boolean;
  resizeAttempted: boolean;
  isZeroDelta: boolean;
  isDoubleClick: boolean;
}): boolean {
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
  maxValue: number,
) {
  return typeof value === "number"
    ? Math.min(Math.max(value, minValue), maxValue)
    : value;
}

export function clampChangedSize({
  changedSize,
  minHeight,
  maxHeight,
  minWidth,
  maxWidth,
}: {
  changedSize: Partial<SectionSize>;
  minHeight: number;
  maxHeight: number;
  minWidth: number;
  maxWidth: number;
}): Partial<SectionSize> {
  return {
    ...changedSize,
    ...(changedSize.height !== undefined
      ? {
          height: clampNumericDimension(
            changedSize.height,
            minHeight,
            maxHeight,
          ),
        }
      : {}),
    ...(changedSize.width !== undefined
      ? {
          width: clampNumericDimension(changedSize.width, minWidth, maxWidth),
        }
      : {}),
  };
}

const AUTO_CLAMP_TOLERANCE = 2;

function shouldClampToMin(currentSize: SectionSize["width"], minSize: number) {
  return (
    typeof currentSize === "number" &&
    minSize - currentSize > AUTO_CLAMP_TOLERANCE
  );
}

function shouldClampToMax(currentSize: SectionSize["width"], maxSize: number) {
  return typeof currentSize === "number" && currentSize > maxSize;
}

export function getAutoClampSize({
  size,
  minHeight,
  maxHeight,
  minWidth,
  maxWidth,
}: {
  size: SectionSize;
  minHeight: number;
  maxHeight: number;
  minWidth: number;
  maxWidth: number;
}): Partial<SectionSize> | null {
  const nextSize: Partial<SectionSize> = {};
  if (shouldClampToMin(size.height, minHeight)) {
    nextSize.height = minHeight;
  } else if (shouldClampToMax(size.height, maxHeight)) {
    nextSize.height = maxHeight;
  }
  if (shouldClampToMin(size.width, minWidth)) {
    nextSize.width = minWidth;
  } else if (shouldClampToMax(size.width, maxWidth)) {
    nextSize.width = maxWidth;
  }
  return Object.keys(nextSize).length > 0 ? nextSize : null;
}

export function getResizableEnable({
  canEditLayout,
  disablePointerEvents,
  positionAndSizeLocked,
  heightResizable,
}: {
  canEditLayout: boolean;
  disablePointerEvents: boolean;
  positionAndSizeLocked: boolean;
  heightResizable: boolean;
}) {
  if (!canEditLayout || disablePointerEvents || positionAndSizeLocked) {
    return false;
  }
  return {
    top: false,
    left: false,
    bottom: heightResizable,
    right: true,
    topRight: false,
    bottomRight: heightResizable,
    topLeft: false,
    bottomLeft: false,
  };
}

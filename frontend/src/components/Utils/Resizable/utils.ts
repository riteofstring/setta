import type { ResizeHandleDirection } from "state/actions/sections/sectionSizes";

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

type ResizeStopEvent = {
  detail?: number;
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

type ResizeStopRef = {
  style: { width: string; height: string };
};

type ResizeDelta = {
  width: number;
  height: number;
};

type ManualSizeUpdate = {
  width?: number;
  height?: number;
};

type SingleClickSizeResolver = (input: {
  manualSize: ManualSizeUpdate;
  aspectRatio: boolean;
}) => ManualSizeUpdate;

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

function parseCurrPx(x) {
  return x === "auto" ? x : parseInt(x);
}

function maybeAutoPx(autoDim, pxDim, sizeMode) {
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
  return aspectRatio ? manualSizeUpdate({ width, height }) : { width };
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
  return aspectRatio ? manualSizeUpdate({ width, height }) : { height };
}

const SINGLE_CLICK_SIZE_RESOLVERS: Partial<
  Record<ResizeHandleDirection, SingleClickSizeResolver>
> = {
  bottomRight: ({ manualSize }) => manualSizeUpdate(manualSize),
  right: getRightManualSizeUpdate,
  bottom: getBottomManualSizeUpdate,
};

function getDoubleClickSize({
  direction,
  ref,
  sizeMode,
  aspectRatio,
}: {
  direction: ResizeHandleDirection;
  ref: ResizeStopRef;
  sizeMode: { width: string; height: string };
  aspectRatio: boolean;
}) {
  // width returns minWidth instead of auto because
  // it seems like once width is resized, auto does nothing
  const pxWidth = parseCurrPx(ref.style.width);
  const pxHeight = parseCurrPx(ref.style.height);
  const autoWidth = maybeAutoPx("auto", pxWidth, sizeMode.width);
  const autoHeight = maybeAutoPx("auto", pxHeight, sizeMode.height);

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

function getSingleClickSize({
  direction,
  ref,
  sizeMode,
  aspectRatio,
}: {
  direction: ResizeHandleDirection;
  ref: ResizeStopRef;
  sizeMode: { width: string; height: string };
  aspectRatio: boolean;
}) {
  // width returns minWidth instead of auto because
  // it seems like once width is resized, auto does nothing
  const pxWidth = parseCurrPx(ref.style.width);
  const pxHeight = parseCurrPx(ref.style.height);
  const manualSize = manualSizeUpdate({
    width: canPersistManualSize(sizeMode.width) ? pxWidth : undefined,
    height: canPersistManualSize(sizeMode.height) ? pxHeight : undefined,
  });
  const resolveSize = SINGLE_CLICK_SIZE_RESOLVERS[direction];
  if (resolveSize) {
    return resolveSize({ manualSize, aspectRatio });
  }
  return {};
}

export function getChangedSize({
  props,
  sizeMode,
  aspectRatio,
  isDoubleClickOverride,
}: {
  props: [ResizeStopEvent, ResizeHandleDirection, ResizeStopRef, ResizeDelta];
  sizeMode: { width: string; height: string };
  aspectRatio: boolean;
  isDoubleClickOverride?: boolean;
}) {
  const [e, direction, ref, d] = props;
  const isDoubleClick =
    isDoubleClickOverride ??
    (d.width === 0 && d.height === 0 && e.detail === 2);
  if (isDoubleClick) {
    return getDoubleClickSize({
      direction,
      ref,
      sizeMode,
      aspectRatio,
    });
  } else {
    return getSingleClickSize({ direction, ref, sizeMode, aspectRatio });
  }
}

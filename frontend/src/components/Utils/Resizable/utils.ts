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

type ResizeStopRef = {
  style: { width: string; height: string };
};

type ResizeDelta = {
  width: number;
  height: number;
};

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

  if (direction === "bottomRight") {
    return {
      width: pxWidth,
      height: pxHeight,
    };
  }
  if (direction === "right" && sizeMode.width) {
    // if aspectRatio is specified, we want to update both width and height
    return aspectRatio
      ? { width: pxWidth, height: pxHeight }
      : { width: pxWidth };
  }
  if (direction === "bottom" && sizeMode.height) {
    // if aspectRatio is specified, we want to update both width and height
    return aspectRatio
      ? { width: pxWidth, height: pxHeight }
      : { height: pxHeight };
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

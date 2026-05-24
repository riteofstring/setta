import {
  getResizeHandleClickState,
  isResizeDoubleClick,
  resolveSectionResizeStopSize,
  SIZE_MODE,
} from "state/actions/sections/sectionResizePolicy";
import type { ResizeHandleDirection } from "state/actions/sections/sectionSizes";

export { getResizeHandleClickState, isResizeDoubleClick, SIZE_MODE };

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

function parseCurrPx(value: string): number {
  const parsed = value === "auto" ? Number.NaN : parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
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
  const [event, direction, ref, delta] = props;
  const isDoubleClick =
    isDoubleClickOverride ??
    (delta.width === 0 && delta.height === 0 && event.detail === 2);
  return resolveSectionResizeStopSize({
    direction,
    finalSize: {
      height: parseCurrPx(ref.style.height),
      width: parseCurrPx(ref.style.width),
    },
    sizeMode,
    aspectRatio,
    isDoubleClick,
  });
}

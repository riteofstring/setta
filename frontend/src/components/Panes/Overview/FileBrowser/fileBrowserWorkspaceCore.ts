import { clamp } from "utils/utils";

export const DEFAULT_PREVIEW_HEIGHT_PCT = 42;
const MIN_PREVIEW_HEIGHT_PCT = 24;
const MIN_LIST_HEIGHT_PCT = 32;

type ResizeListenerTarget = Pick<
  Window,
  "addEventListener" | "removeEventListener"
>;

export function getListHeightPct({
  previewHeightPct,
  isPreviewMinimized,
}: {
  previewHeightPct: number;
  isPreviewMinimized: boolean;
}): number {
  if (isPreviewMinimized) {
    return 100;
  }
  return clamp(100 - previewHeightPct, MIN_LIST_HEIGHT_PCT, 100);
}

export function getPreviewHeightPctFromPointer({
  pointerClientY,
  containerTop,
  containerHeight,
}: {
  pointerClientY: number;
  containerTop: number;
  containerHeight: number;
}): number {
  const offsetY = pointerClientY - containerTop;
  const rawListPct = (offsetY / containerHeight) * 100;
  const boundedListPct = clamp(
    rawListPct,
    MIN_LIST_HEIGHT_PCT,
    100 - MIN_PREVIEW_HEIGHT_PCT,
  );
  return 100 - boundedListPct;
}

export function attachPreviewResizeListeners(args: {
  target: ResizeListenerTarget;
  onMove: (event: PointerEvent) => void;
  onUp: (event: PointerEvent) => void;
}): () => void {
  const { target, onMove, onUp } = args;
  target.addEventListener("pointermove", onMove);
  target.addEventListener("pointerup", onUp);
  target.addEventListener("pointercancel", onUp);
  return () => {
    target.removeEventListener("pointermove", onMove);
    target.removeEventListener("pointerup", onUp);
    target.removeEventListener("pointercancel", onUp);
  };
}

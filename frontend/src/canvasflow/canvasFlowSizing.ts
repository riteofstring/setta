import type { CanvasFlowSize } from "./canvasFlowTypes";

export function getCanvasFlowSizeFromResizeEntry(
  entry: Pick<ResizeObserverEntry, "contentRect">,
): CanvasFlowSize {
  const cssWidth = entry.contentRect.width;
  const cssHeight = entry.contentRect.height;
  // HTML-in-Canvas layoutsubtree currently uses canvas.width/height as the
  // child layout viewport. Keep the bitmap 1:1 with CSS pixels; a DPR-scaled
  // backing store breaks child snapshots and inflates per-frame pixel work.
  const pixelWidth = Math.max(1, Math.round(cssWidth));
  const pixelHeight = Math.max(1, Math.round(cssHeight));
  return {
    cssWidth,
    cssHeight,
    pixelWidth,
    pixelHeight,
    pixelRatio: 1,
  };
}

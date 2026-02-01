type ResizeDelta = { height: number; width: number };

type PinnedResizeInput = {
  didResize: boolean;
  delta: ResizeDelta;
  startHeight: number | null;
  styleHeight: number | null;
  minHeight: number;
  maxHeight?: number | null;
};

export function getPinnedResizeHeight({
  didResize,
  delta,
  startHeight,
  styleHeight,
  minHeight,
  maxHeight,
}: PinnedResizeInput): number | null {
  if (!didResize) {
    return null;
  }
  if (delta.height === 0 && delta.width === 0) {
    return null;
  }
  let nextHeight: number | null = null;
  if (typeof startHeight === "number" && Number.isFinite(startHeight)) {
    nextHeight = startHeight + delta.height;
  } else if (typeof styleHeight === "number" && Number.isFinite(styleHeight)) {
    nextHeight = styleHeight;
  }

  if (nextHeight === null || !Number.isFinite(nextHeight)) {
    return null;
  }
  const resolvedMaxHeight =
    typeof maxHeight === "number" && Number.isFinite(maxHeight)
      ? maxHeight
      : null;
  const resolvedMinHeight =
    resolvedMaxHeight !== null && resolvedMaxHeight < minHeight
      ? resolvedMaxHeight
      : minHeight;
  if (resolvedMaxHeight !== null && nextHeight > resolvedMaxHeight) {
    return resolvedMaxHeight;
  }
  if (nextHeight < resolvedMinHeight) {
    return resolvedMinHeight;
  }
  return nextHeight;
}

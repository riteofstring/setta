export type ResizeDelta = { height: number; width: number };

type PinnedResizeInput = {
  didResize: boolean;
  delta: ResizeDelta;
  startHeight: number | null;
  styleHeight: number | null;
  minHeight: number;
};

export function getPinnedResizeHeight({
  didResize,
  delta,
  startHeight,
  styleHeight,
  minHeight,
}: PinnedResizeInput): number | null {
  if (!didResize) {
    return null;
  }
  if (delta.height === 0 && delta.width === 0) {
    return null;
  }
  const hasStyleHeight =
    typeof styleHeight === "number" && Number.isFinite(styleHeight);
  let nextHeight: number | null = null;
  if (hasStyleHeight) {
    nextHeight = styleHeight;
  } else if (typeof startHeight === "number") {
    nextHeight = startHeight + delta.height;
  }

  if (nextHeight === null || !Number.isFinite(nextHeight)) {
    return null;
  }
  if (nextHeight < minHeight) {
    return minHeight;
  }
  return nextHeight;
}

type ResizeObserverEntryLike = Pick<
  ResizeObserverEntry,
  "borderBoxSize" | "contentRect"
>;

function getBorderBoxBlockSize(
  borderBoxSize: ResizeObserverEntryLike["borderBoxSize"],
): number | null {
  if (Array.isArray(borderBoxSize)) {
    const firstSize = borderBoxSize[0];
    if (firstSize && Number.isFinite(firstSize.blockSize)) {
      return firstSize.blockSize;
    }
    return null;
  }
  if (borderBoxSize && Number.isFinite(borderBoxSize.blockSize)) {
    return borderBoxSize.blockSize;
  }
  return null;
}

export function getObservedElementHeight({
  entry,
  getFallbackOffsetHeight,
}: {
  entry: ResizeObserverEntryLike | null;
  getFallbackOffsetHeight: () => number;
}): number {
  if (entry) {
    const borderBoxHeight = getBorderBoxBlockSize(entry.borderBoxSize);
    if (borderBoxHeight !== null) {
      return borderBoxHeight;
    }
    if (Number.isFinite(entry.contentRect.height)) {
      return entry.contentRect.height;
    }
  }
  const fallbackOffsetHeight = getFallbackOffsetHeight();
  if (Number.isFinite(fallbackOffsetHeight)) {
    return fallbackOffsetHeight;
  }
  return 0;
}

export function getElementVerticalMargin(element: HTMLElement): number {
  const style = window.getComputedStyle(element);
  const marginTop = Number.parseFloat(style.marginTop) || 0;
  const marginBottom = Number.parseFloat(style.marginBottom) || 0;
  return marginTop + marginBottom;
}

type RectLike = {
  height: number;
  left: number;
  top: number;
  width: number;
};

export type SectionRelativeGraphSpaceRect = {
  height: number;
  offsetX: number;
  offsetY: number;
  width: number;
};

export function normalizeViewportScale(
  viewportScale: number | null | undefined,
): number {
  return typeof viewportScale === "number" &&
    Number.isFinite(viewportScale) &&
    viewportScale > 0
    ? viewportScale
    : 1;
}

export function toGraphSpaceLength(
  length: number,
  viewportScale: number | null | undefined,
): number {
  return length / normalizeViewportScale(viewportScale);
}

export function measureSectionRelativeGraphSpaceRect({
  rect,
  sectionRect,
  viewportScale,
}: {
  rect: RectLike;
  sectionRect: RectLike;
  viewportScale: number | null | undefined;
}): SectionRelativeGraphSpaceRect | null {
  if (
    rect.width <= 0 ||
    rect.height <= 0 ||
    sectionRect.width <= 0 ||
    sectionRect.height <= 0
  ) {
    return null;
  }

  const scale = normalizeViewportScale(viewportScale);

  return {
    height: rect.height / scale,
    offsetX: (rect.left - sectionRect.left) / scale,
    offsetY: (rect.top - sectionRect.top) / scale,
    width: rect.width / scale,
  };
}

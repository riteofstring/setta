import type { HtmlSurfaceSourceRect } from "./sourceRects";

type HtmlSurfacePaintSourceRectHint = {
  rect: HtmlSurfaceSourceRect;
  retainDirectPaintCount: number;
};

const sourceRectHints = new WeakMap<Element, HtmlSurfacePaintSourceRectHint>();

const FINAL_ANIMATION_DIRECT_PAINT_RETAIN_COUNT = 8;

export function setHtmlSurfaceActivePaintSourceRectHint(
  sourceElement: Element,
  rect: HtmlSurfaceSourceRect,
) {
  sourceRectHints.set(sourceElement, {
    rect,
    retainDirectPaintCount: Number.POSITIVE_INFINITY,
  });
}

export function releaseHtmlSurfaceActivePaintSourceRectHint(
  sourceElement: Element,
) {
  const hint = sourceRectHints.get(sourceElement);
  if (!hint) {
    return;
  }
  sourceRectHints.set(sourceElement, {
    rect: hint.rect,
    retainDirectPaintCount: FINAL_ANIMATION_DIRECT_PAINT_RETAIN_COUNT,
  });
}

export function resolveHtmlSurfaceDirectPaintSourceRectHint(
  sourceElement: Element,
): HtmlSurfaceSourceRect | undefined {
  const hint = sourceRectHints.get(sourceElement);
  if (!hint) {
    return undefined;
  }
  if (hint.retainDirectPaintCount === Number.POSITIVE_INFINITY) {
    return hint.rect;
  }
  if (hint.retainDirectPaintCount <= 0) {
    sourceRectHints.delete(sourceElement);
    return undefined;
  }
  hint.retainDirectPaintCount -= 1;
  return hint.rect;
}

import type { BoundingRectangle } from "@dnd-kit/geometry";

export type DragRectLike = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

function resolveRectBounds(
  rects: Iterable<DragRectLike>,
): BoundingRectangle | null {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  let hasRect = false;

  for (const rect of rects) {
    hasRect = true;
    left = Math.min(left, rect.left);
    top = Math.min(top, rect.top);
    right = Math.max(right, rect.right);
    bottom = Math.max(bottom, rect.bottom);
  }

  if (!hasRect) {
    return null;
  }

  return {
    top,
    left,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}

export function resolveRectBoundsById(
  ids: string[],
  rectsById: Record<string, DragRectLike> | null,
): BoundingRectangle | null {
  if (!rectsById || ids.length === 0) {
    return null;
  }

  const rects: DragRectLike[] = [];
  for (const id of ids) {
    const rect = rectsById[id];
    if (!rect) {
      return null;
    }
    rects.push(rect);
  }

  return resolveRectBounds(rects);
}

export function resolveRectBoundsFromMap(
  rectsById: Record<string, DragRectLike> | null,
): BoundingRectangle | null {
  if (!rectsById) {
    return null;
  }

  return resolveRectBounds(Object.values(rectsById));
}

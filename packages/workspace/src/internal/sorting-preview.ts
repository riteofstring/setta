import type { ListOrientation } from "./collision-characterization.js";
import type { DragTransform, InteractionRect } from "./interaction-geometry.js";

export type SortingPreview = {
  destinationIndex: number;
  order: readonly string[];
  transformsById: Readonly<Record<string, DragTransform>>;
};

export function resolveSortingPreview({
  activeId,
  ids,
  orientation,
  pastMidpoint,
  rectsById,
  targetId,
}: {
  activeId: string;
  ids: readonly string[];
  orientation: ListOrientation;
  pastMidpoint: boolean;
  rectsById: Readonly<Record<string, InteractionRect>>;
  targetId: string;
}): SortingPreview | null {
  const activeIndex = ids.indexOf(activeId);
  if (activeIndex < 0 || activeId === targetId) {
    return null;
  }
  const filteredIds = ids.filter((id) => id !== activeId);
  const targetIndex = filteredIds.indexOf(targetId);
  if (targetIndex < 0) {
    return null;
  }

  const destinationIndex = targetIndex + Number(pastMidpoint);
  const order = insertAt(filteredIds, destinationIndex, activeId);
  const transformsById = Object.fromEntries(
    ids.map((id, index) => [
      id,
      resolveItemTransform({
        activeId,
        activeIndex,
        destinationIndex,
        id,
        ids,
        index,
        orientation,
        rectsById,
      }),
    ]),
  );
  return { destinationIndex, order, transformsById };
}

function resolveItemTransform({
  activeId,
  activeIndex,
  destinationIndex,
  id,
  ids,
  index,
  orientation,
  rectsById,
}: {
  activeId: string;
  activeIndex: number;
  destinationIndex: number;
  id: string;
  ids: readonly string[];
  index: number;
  orientation: ListOrientation;
  rectsById: Readonly<Record<string, InteractionRect>>;
}): DragTransform {
  if (id === activeId) {
    return resolveActiveTransform(
      activeId,
      activeIndex,
      destinationIndex,
      ids,
      orientation,
      rectsById,
    );
  }
  return resolveSiblingTransform({
    activeId,
    activeIndex,
    destinationIndex,
    id,
    ids,
    index,
    orientation,
    rectsById,
  });
}

function resolveActiveTransform(
  activeId: string,
  activeIndex: number,
  destinationIndex: number,
  ids: readonly string[],
  orientation: ListOrientation,
  rectsById: Readonly<Record<string, InteractionRect>>,
): DragTransform {
  const activeRect = rectsById[activeId];
  if (!activeRect || activeIndex === destinationIndex) {
    return createAxisTransform(orientation, 0);
  }

  const destinationId = ids[destinationIndex];
  const destinationRect = destinationId ? rectsById[destinationId] : undefined;
  if (!destinationRect) {
    return createAxisTransform(orientation, 0);
  }
  const movingForward = activeIndex < destinationIndex;
  const delta = movingForward
    ? rectEnd(destinationRect, orientation) - rectEnd(activeRect, orientation)
    : rectStart(destinationRect, orientation) - rectStart(activeRect, orientation);
  return createAxisTransform(orientation, delta);
}

function resolveSiblingTransform({
  activeId,
  activeIndex,
  destinationIndex,
  id,
  ids,
  index,
  orientation,
  rectsById,
}: {
  activeId: string;
  activeIndex: number;
  destinationIndex: number;
  id: string;
  ids: readonly string[];
  index: number;
  orientation: ListOrientation;
  rectsById: Readonly<Record<string, InteractionRect>>;
}): DragTransform {
  const movesBackward = index > activeIndex && index <= destinationIndex;
  const movesForward = index < activeIndex && index >= destinationIndex;
  if (!movesBackward && !movesForward) {
    return createAxisTransform(orientation, 0);
  }

  const activeRect = rectsById[activeId];
  const currentRect = rectsById[id];
  if (!activeRect || !currentRect) {
    return createAxisTransform(orientation, 0);
  }
  const gap = resolveAdjacentGap(currentRect, index, ids, activeIndex, orientation, rectsById);
  const distance = rectSize(activeRect, orientation) + gap;
  return createAxisTransform(orientation, movesBackward ? -distance : distance);
}

function resolveAdjacentGap(
  currentRect: InteractionRect,
  index: number,
  ids: readonly string[],
  activeIndex: number,
  orientation: ListOrientation,
  rectsById: Readonly<Record<string, InteractionRect>>,
): number {
  const prefersPrevious = activeIndex < index;
  const preferredId = ids[prefersPrevious ? index - 1 : index + 1];
  const fallbackId = ids[prefersPrevious ? index + 1 : index - 1];
  const preferred = preferredId ? rectsById[preferredId] : undefined;
  const fallback = fallbackId ? rectsById[fallbackId] : undefined;
  return (
    gapToAdjacent(currentRect, preferred, orientation, prefersPrevious) ??
    gapToAdjacent(currentRect, fallback, orientation, !prefersPrevious) ??
    0
  );
}

function gapToAdjacent(
  current: InteractionRect,
  adjacent: InteractionRect | undefined,
  orientation: ListOrientation,
  adjacentIsPrevious: boolean,
): number | null {
  if (!adjacent) {
    return null;
  }
  return adjacentIsPrevious
    ? rectStart(current, orientation) - rectEnd(adjacent, orientation)
    : rectStart(adjacent, orientation) - rectEnd(current, orientation);
}

function rectStart(rect: InteractionRect, orientation: ListOrientation): number {
  return orientation === "vertical" ? rect.y : rect.x;
}

function rectSize(rect: InteractionRect, orientation: ListOrientation): number {
  return orientation === "vertical" ? rect.height : rect.width;
}

function rectEnd(rect: InteractionRect, orientation: ListOrientation): number {
  return rectStart(rect, orientation) + rectSize(rect, orientation);
}

function createAxisTransform(orientation: ListOrientation, delta: number): DragTransform {
  return {
    x: orientation === "horizontal" ? delta : 0,
    y: orientation === "vertical" ? delta : 0,
    scaleX: 1,
    scaleY: 1,
  };
}

function insertAt<T>(items: readonly T[], index: number, item: T): readonly T[] {
  return [...items.slice(0, index), item, ...items.slice(index)];
}

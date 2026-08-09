import type { UniqueIdentifier } from "@dnd-kit/abstract";
import type { ClientRect, Disabled, SortingStrategy, Transform } from "./types";

const defaultScale = {
  scaleX: 1,
  scaleY: 1,
};

type Orientation = "vertical" | "horizontal";

export function itemsEqual(
  a: UniqueIdentifier[],
  b: UniqueIdentifier[],
): boolean {
  if (a === b) {
    return true;
  }

  if (a.length !== b.length) {
    return false;
  }

  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }

  return true;
}

export function isValidIndex(index: number | null): index is number {
  return index !== null && index >= 0;
}

export function normalizeDisabled(disabled: boolean | Disabled): Disabled {
  if (typeof disabled === "boolean") {
    return {
      draggable: disabled,
      droppable: disabled,
    };
  }

  return disabled;
}

export function getSortedRects(
  items: UniqueIdentifier[],
  rects: Map<UniqueIdentifier, ClientRect>,
): Array<ClientRect | undefined> {
  return items.reduce<Array<ClientRect | undefined>>((acc, id, index) => {
    const rect = rects.get(id);

    if (rect) {
      acc[index] = rect;
    }

    return acc;
  }, Array(items.length));
}

export function computeNewIndex(
  activeIdx: number,
  overIdx: number,
  pastHalfway: boolean,
  maxIdx: number,
): number {
  const movingUp = overIdx < activeIdx;
  const offset = movingUp ? Number(pastHalfway) : Number(pastHalfway) - 1;
  const candidateIndex = overIdx + offset;
  const lowerBound = movingUp ? 0 : activeIdx;
  const upperBound = movingUp ? activeIdx : maxIdx;

  return Math.min(upperBound, Math.max(lowerBound, candidateIndex));
}

export const rectSortingStrategy: SortingStrategy = ({
  rects,
  activeIndex,
  overIndex,
  index,
}) => {
  const newRects = arrayMove(rects, overIndex, activeIndex);
  const oldRect = rects[index];
  const newRect = newRects[index];

  if (!newRect || !oldRect) {
    return null;
  }

  return {
    x: newRect.left - oldRect.left,
    y: newRect.top - oldRect.top,
    scaleX: newRect.width / oldRect.width,
    scaleY: newRect.height / oldRect.height,
  };
};

export const verticalListSortingStrategy =
  createListSortingStrategy("vertical");

export const horizontalListSortingStrategy =
  createListSortingStrategy("horizontal");

export function resolveStrategyResult(
  result: ReturnType<SortingStrategy>,
  fallbackOverIndex: number,
): { transform: Transform | null; overIndex: number } {
  if (!result) {
    return { transform: null, overIndex: fallbackOverIndex };
  }

  if (Array.isArray(result)) {
    return {
      transform: result[0],
      overIndex: result[1],
    };
  }

  return {
    transform: result,
    overIndex: fallbackOverIndex,
  };
}

function getEffectiveOverIndex({
  activeIndex,
  overIndex,
  pastHalfway,
  rectsLength,
}: {
  activeIndex: number;
  overIndex: number;
  pastHalfway: boolean | undefined;
  rectsLength: number;
}): number {
  if (pastHalfway === undefined) {
    return overIndex;
  }

  return computeNewIndex(activeIndex, overIndex, pastHalfway, rectsLength);
}

function createListSortingStrategy(orientation: Orientation): SortingStrategy {
  return ({
    activeIndex,
    activeNodeRect: fallbackActiveRect,
    index,
    rects,
    overIndex,
    pastHalfway,
  }) => {
    const activeNodeRect = rects[activeIndex] ?? fallbackActiveRect ?? null;
    const effectiveOverIndex = getEffectiveOverIndex({
      activeIndex,
      overIndex,
      pastHalfway,
      rectsLength: rects.length,
    });

    if (!activeNodeRect) {
      return [null, effectiveOverIndex];
    }

    return [
      index === activeIndex
        ? getActiveItemTransform(
            activeNodeRect,
            rects[effectiveOverIndex],
            activeIndex,
            effectiveOverIndex,
            orientation,
          )
        : getSiblingItemTransform({
            activeNodeRect,
            rects,
            activeIndex,
            effectiveOverIndex,
            index,
            orientation,
          }),
      effectiveOverIndex,
    ];
  };
}

function getActiveItemTransform(
  activeNodeRect: ClientRect,
  overIndexRect: ClientRect | undefined,
  activeIndex: number,
  effectiveOverIndex: number,
  orientation: Orientation,
): Transform | null {
  if (!overIndexRect) {
    return null;
  }

  const activeStart = getRectStart(activeNodeRect, orientation);
  const activeEnd = getRectEnd(activeNodeRect, orientation);
  const overStart = getRectStart(overIndexRect, orientation);
  const overEnd = getRectEnd(overIndexRect, orientation);
  const delta =
    activeIndex < effectiveOverIndex
      ? overEnd - activeEnd
      : overStart - activeStart;

  return createTransform(orientation, delta);
}

function getSiblingItemTransform({
  activeNodeRect,
  rects,
  activeIndex,
  effectiveOverIndex,
  index,
  orientation,
}: {
  activeNodeRect: ClientRect;
  rects: Array<ClientRect | undefined>;
  activeIndex: number;
  effectiveOverIndex: number;
  index: number;
  orientation: Orientation;
}): Transform {
  const isDisplacedAfterActive =
    index > activeIndex && index <= effectiveOverIndex;
  const isDisplacedBeforeActive =
    index < activeIndex && index >= effectiveOverIndex;

  if (!isDisplacedAfterActive && !isDisplacedBeforeActive) {
    return createTransform(orientation, 0);
  }

  const delta =
    getRectSize(activeNodeRect, orientation) +
    getItemGap(rects, index, activeIndex, orientation);

  return createTransform(orientation, isDisplacedAfterActive ? -delta : delta);
}

function getItemGap(
  clientRects: Array<ClientRect | undefined>,
  index: number,
  activeIndex: number,
  orientation: Orientation = "vertical",
): number {
  const currentRect = clientRects[index];

  if (!currentRect) {
    return 0;
  }

  const prefersPreviousRect = activeIndex < index;

  return (
    getGapToAdjacentRect(
      currentRect,
      prefersPreviousRect ? clientRects[index - 1] : clientRects[index + 1],
      orientation,
      prefersPreviousRect ? "previous" : "next",
    ) ??
    getGapToAdjacentRect(
      currentRect,
      prefersPreviousRect ? clientRects[index + 1] : clientRects[index - 1],
      orientation,
      prefersPreviousRect ? "next" : "previous",
    ) ??
    0
  );
}

function getGapToAdjacentRect(
  currentRect: ClientRect,
  adjacentRect: ClientRect | undefined,
  orientation: Orientation,
  position: "previous" | "next",
): number | null {
  if (!adjacentRect) {
    return null;
  }

  if (position === "previous") {
    return (
      getRectStart(currentRect, orientation) -
      getRectEnd(adjacentRect, orientation)
    );
  }

  return (
    getRectStart(adjacentRect, orientation) -
    getRectEnd(currentRect, orientation)
  );
}

function getRectStart(rect: ClientRect, orientation: Orientation): number {
  return orientation === "vertical" ? rect.top : rect.left;
}

function getRectSize(rect: ClientRect, orientation: Orientation): number {
  return orientation === "vertical" ? rect.height : rect.width;
}

function getRectEnd(rect: ClientRect, orientation: Orientation): number {
  return getRectStart(rect, orientation) + getRectSize(rect, orientation);
}

function createTransform(orientation: Orientation, delta: number): Transform {
  return orientation === "vertical"
    ? {
        x: 0,
        y: delta,
        ...defaultScale,
      }
    : {
        x: delta,
        y: 0,
        ...defaultScale,
      };
}

function arrayMove<T>(array: T[], from: number, to: number): T[] {
  const nextArray = array.slice();
  const startIndex = from < 0 ? nextArray.length + from : from;

  if (startIndex >= 0 && startIndex < nextArray.length) {
    const endIndex = to < 0 ? nextArray.length + to : to;
    const [item] = nextArray.splice(from, 1);
    nextArray.splice(endIndex, 0, item);
  }

  return nextArray;
}

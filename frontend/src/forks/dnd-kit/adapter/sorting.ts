import type { UniqueIdentifier } from "@dnd-kit/abstract";
import type { ClientRect, Disabled, SortingStrategy, Transform } from "./types";

const defaultScale = {
  scaleX: 1,
  scaleY: 1,
};

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

export function normalizeDisabled(
  disabled: boolean | Disabled,
): Disabled {
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
  if (activeIdx === 0) {
    if (overIdx === 0) {
      return 0;
    }

    if (pastHalfway) {
      return overIdx;
    }

    return Math.max(0, overIdx - 1);
  }

  if (activeIdx === maxIdx) {
    if (overIdx === maxIdx) {
      return maxIdx;
    }

    if (pastHalfway) {
      return Math.min(maxIdx, overIdx + 1);
    }

    return overIdx;
  }

  if (overIdx < activeIdx) {
    if (pastHalfway) {
      return Math.min(activeIdx, overIdx + 1);
    }

    return overIdx;
  }

  if (overIdx > activeIdx) {
    if (pastHalfway) {
      return overIdx;
    }

    return Math.max(activeIdx, overIdx - 1);
  }

  return activeIdx;
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

export const verticalListSortingStrategy: SortingStrategy = ({
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

  if (index === activeIndex) {
    const overIndexRect = rects[effectiveOverIndex];

    if (!overIndexRect) {
      return [null, effectiveOverIndex];
    }

    const delta =
      activeIndex < effectiveOverIndex
        ? overIndexRect.top +
          overIndexRect.height -
          (activeNodeRect.top + activeNodeRect.height)
        : overIndexRect.top - activeNodeRect.top;

    return [
      {
        x: 0,
        y: delta,
        ...defaultScale,
      },
      effectiveOverIndex,
    ];
  }

  const itemGap = getItemGap(rects, index, activeIndex);

  if (index > activeIndex && index <= effectiveOverIndex) {
    return [
      {
        x: 0,
        y: -activeNodeRect.height - itemGap,
        ...defaultScale,
      },
      effectiveOverIndex,
    ];
  }

  if (index < activeIndex && index >= effectiveOverIndex) {
    return [
      {
        x: 0,
        y: activeNodeRect.height + itemGap,
        ...defaultScale,
      },
      effectiveOverIndex,
    ];
  }

  return [
    {
      x: 0,
      y: 0,
      ...defaultScale,
    },
    effectiveOverIndex,
  ];
};

export const horizontalListSortingStrategy: SortingStrategy = ({
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

  if (index === activeIndex) {
    const overIndexRect = rects[effectiveOverIndex];

    if (!overIndexRect) {
      return [null, effectiveOverIndex];
    }

    const delta =
      activeIndex < effectiveOverIndex
        ? overIndexRect.left +
          overIndexRect.width -
          (activeNodeRect.left + activeNodeRect.width)
        : overIndexRect.left - activeNodeRect.left;

    return [
      {
        x: delta,
        y: 0,
        ...defaultScale,
      },
      effectiveOverIndex,
    ];
  }

  const itemGap = getItemGap(rects, index, activeIndex, "horizontal");

  if (index > activeIndex && index <= effectiveOverIndex) {
    return [
      {
        x: -activeNodeRect.width - itemGap,
        y: 0,
        ...defaultScale,
      },
      effectiveOverIndex,
    ];
  }

  if (index < activeIndex && index >= effectiveOverIndex) {
    return [
      {
        x: activeNodeRect.width + itemGap,
        y: 0,
        ...defaultScale,
      },
      effectiveOverIndex,
    ];
  }

  return [
    {
      x: 0,
      y: 0,
      ...defaultScale,
    },
    effectiveOverIndex,
  ];
};

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

function getItemGap(
  clientRects: Array<ClientRect | undefined>,
  index: number,
  activeIndex: number,
  orientation: "vertical" | "horizontal" = "vertical",
): number {
  const currentRect = clientRects[index];
  const previousRect = clientRects[index - 1];
  const nextRect = clientRects[index + 1];

  if (!currentRect) {
    return 0;
  }

  if (activeIndex < index) {
    if (previousRect) {
      return orientation === "vertical"
        ? currentRect.top - (previousRect.top + previousRect.height)
        : currentRect.left - (previousRect.left + previousRect.width);
    }

    if (nextRect) {
      return orientation === "vertical"
        ? nextRect.top - (currentRect.top + currentRect.height)
        : nextRect.left - (currentRect.left + currentRect.width);
    }

    return 0;
  }

  if (nextRect) {
    return orientation === "vertical"
      ? nextRect.top - (currentRect.top + currentRect.height)
      : nextRect.left - (currentRect.left + currentRect.width);
  }

  if (previousRect) {
    return orientation === "vertical"
      ? currentRect.top - (previousRect.top + previousRect.height)
      : currentRect.left - (previousRect.left + previousRect.width);
  }

  return 0;
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

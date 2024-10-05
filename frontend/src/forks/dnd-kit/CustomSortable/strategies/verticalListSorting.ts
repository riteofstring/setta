import type { ClientRect } from "forks/dnd-kit/CustomCore";
import type { SortingStrategy } from "../types";

// To-do: We should be calculating scale transformation
const defaultScale = {
  scaleX: 1,
  scaleY: 1,
};

export const verticalListSortingStrategy: SortingStrategy = ({
  activeIndex,
  activeNodeRect: fallbackActiveRect,
  index,
  rects,
  overIndex,
  pastHalfway,
}) => {
  const activeNodeRect = rects[activeIndex] ?? fallbackActiveRect;
  const effectiveOverIndex = computeNewIndex(
    activeIndex,
    overIndex,
    pastHalfway,
    rects.length,
  );

  if (!activeNodeRect) {
    return [null, effectiveOverIndex];
  }

  if (index === activeIndex) {
    const overIndexRect = rects[effectiveOverIndex];
    if (!overIndexRect) {
      return [null, effectiveOverIndex];
    }

    return [
      {
        x: 0,
        y:
          activeIndex < effectiveOverIndex
            ? overIndexRect.top +
              overIndexRect.height -
              (activeNodeRect.top + activeNodeRect.height)
            : overIndexRect.top - activeNodeRect.top,
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

  console.log("returnin default")
  return [
    {
      x: 0,
      y: 0,
      ...defaultScale,
    },
    effectiveOverIndex,
  ];
};

function getItemGap(
  clientRects: ClientRect[],
  index: number,
  activeIndex: number,
) {
  const currentRect: ClientRect | undefined = clientRects[index];
  const previousRect: ClientRect | undefined = clientRects[index - 1];
  const nextRect: ClientRect | undefined = clientRects[index + 1];

  if (!currentRect) {
    return 0;
  }

  if (activeIndex < index) {
    return previousRect
      ? currentRect.top - (previousRect.top + previousRect.height)
      : nextRect
        ? nextRect.top - (currentRect.top + currentRect.height)
        : 0;
  }

  return nextRect
    ? nextRect.top - (currentRect.top + currentRect.height)
    : previousRect
      ? currentRect.top - (previousRect.top + previousRect.height)
      : 0;
}

function computeNewIndex(activeIdx, overIdx, pastHalfway, maxIdx) {
  // Handle special case when activeIdx is 0
  if (activeIdx === 0) {
    if (overIdx === 0) {
      return 0;
    } else if (pastHalfway) {
      return overIdx;
    } else {
      return Math.max(0, overIdx - 1);
    }
  }

  // Handle special case when activeIdx is maxIdx
  if (activeIdx === maxIdx) {
    if (overIdx === maxIdx) {
      return maxIdx;
    } else if (pastHalfway) {
      return Math.min(maxIdx, overIdx + 1);
    } else {
      return overIdx;
    }
  }

  // Handle general case
  if (overIdx < activeIdx) {
    return pastHalfway ? Math.min(activeIdx, overIdx + 1) : overIdx;
  } else if (overIdx > activeIdx) {
    return pastHalfway ? overIdx : Math.max(activeIdx, overIdx - 1);
  } else {
    return activeIdx;
  }
}

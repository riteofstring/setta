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
}) => {
  const activeNodeRect = rects[activeIndex] ?? fallbackActiveRect;
  const overIndexRect = rects[overIndex];

  if (!activeNodeRect || !overIndexRect) {
    return [null, overIndex];
  }

  const activeRect = active.rect.current.translated;

  const effectiveOverIndex =
    activeRect.bottom > (overIndexRect.top + overIndexRect.bottom) / 2
      ? overIndex
      : overIndex - 1;

  const effectiveOverRect = rects[effectiveOverIndex];
  if (!effectiveOverRect) {
    return [null, effectiveOverIndex];
  }

  if (index === activeIndex) {
    return [
      {
        x: 0,
        y:
          activeIndex < effectiveOverIndex
            ? effectiveOverRect.top +
              effectiveOverRect.height -
              (activeNodeRect.top + activeNodeRect.height)
            : effectiveOverRect.top - activeNodeRect.top,
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

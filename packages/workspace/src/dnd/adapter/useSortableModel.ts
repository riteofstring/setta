import type { UniqueIdentifier } from "@dnd-kit/abstract";
import type { Coordinates } from "@dnd-kit/geometry";
import { isValidIndex, resolveStrategyResult } from "./sorting";
import type {
  ClientRect,
  Disabled,
  SettaCollision,
  SortingStrategy,
  Transform,
} from "./types";

export type SortableTransition = {
  duration?: number;
  easing?: string;
};

export const DEFAULT_SORTABLE_TRANSITION = {
  duration: 250,
  easing: "cubic-bezier(0.25, 1, 0.5, 1)",
};
const disabledTransition = "transform 0ms linear";

type SortablePresentationInput = {
  activeIndex: number;
  activeRect: ClientRect | null;
  collisions: SettaCollision[] | null;
  disableTransforms: boolean;
  dragTransform: Transform | null;
  index: number;
  isDragging: boolean;
  items: UniqueIdentifier[];
  itemsHaveChanged: boolean;
  overIndex: number;
  shouldTrackSorting: boolean;
  sortedRects: Array<ClientRect | undefined>;
  sortingEnabled: boolean;
  strategy: SortingStrategy;
  transition: SortableTransition | null | undefined;
  wasDragActive: boolean;
};

export function buildSortablePresentationState(
  input: SortablePresentationInput,
): {
  effectiveOverIndex: number;
  finalTransform: Transform | null;
  isDraggingActive: boolean;
  isSorting: boolean;
  transitionValue: string | undefined;
} {
  const {
    activeIndex,
    index,
    shouldTrackSorting,
    isDragging,
    transition,
    disableTransforms,
    sortingEnabled,
    wasDragActive,
    itemsHaveChanged,
  } = input;
  const isSorting = shouldTrackSorting && activeIndex !== -1;
  const isActiveItem = index === activeIndex && activeIndex !== -1;
  const isDraggingActive = isDragging || (isSorting && isActiveItem);
  const resolved = resolveSortingTransform(input, isSorting, isActiveItem);

  return {
    effectiveOverIndex: resolved.overIndex,
    finalTransform: resolved.transform,
    isDraggingActive,
    isSorting,
    transitionValue: getTransitionValue({
      transition,
      isSorting,
      isDragging: isDraggingActive,
      disableTransforms,
      forceDisabledTransition:
        sortingEnabled && wasDragActive && itemsHaveChanged,
    }),
  };
}

function resolveSortingTransform(
  {
    activeIndex,
    activeRect,
    collisions,
    disableTransforms,
    dragTransform,
    index,
    items,
    overIndex,
    sortedRects,
    strategy,
  }: SortablePresentationInput,
  isSorting: boolean,
  isActiveItem: boolean,
): {
  transform: Transform | null;
  overIndex: number;
} {
  if (!isSorting || disableTransforms) {
    return { transform: null, overIndex };
  }
  if (isActiveItem) {
    return { transform: dragTransform, overIndex };
  }
  if (!isValidIndex(activeIndex) || !isValidIndex(overIndex)) {
    return { transform: null, overIndex };
  }
  const collision = getRelevantCollision(
    collisions,
    items,
    items[overIndex] ?? null,
  );
  return resolveStrategyResult(
    strategy({
      rects: sortedRects,
      activeNodeRect: activeRect,
      activeIndex,
      overIndex,
      index,
      pastHalfway: collision?.pastHalfway ?? undefined,
    }),
    overIndex,
  );
}

export function normalizeLocalDisabled(
  localDisabled: boolean | Disabled | undefined,
  globalDisabled: Disabled,
): Disabled {
  if (typeof localDisabled === "boolean") {
    return {
      draggable: localDisabled,
      droppable: false,
    };
  }

  return {
    draggable: localDisabled?.draggable ?? globalDisabled.draggable,
    droppable: localDisabled?.droppable ?? globalDisabled.droppable,
  };
}

export function toTransform(transform: Coordinates | undefined): Transform {
  return {
    x: transform?.x ?? 0,
    y: transform?.y ?? 0,
    scaleX: 1,
    scaleY: 1,
  };
}

export function getRelevantCollision(
  collisions: SettaCollision[] | null,
  items: UniqueIdentifier[],
  preferredId: UniqueIdentifier | null,
): SettaCollision | null {
  if (!collisions || collisions.length === 0) {
    return null;
  }

  if (preferredId) {
    const preferredCollision = collisions.find(
      (collision) => collision.id === preferredId,
    );
    return preferredCollision ?? null;
  }

  for (const collision of collisions) {
    if (items.includes(collision.id)) {
      return collision;
    }
  }

  return collisions[0] ?? null;
}

export function toClientRect(rect: ClientRect): ClientRect {
  return {
    top: rect.top,
    left: rect.left,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  };
}

function getTransitionValue({
  transition,
  isSorting,
  isDragging,
  disableTransforms,
  forceDisabledTransition,
}: {
  transition: SortableTransition | null | undefined;
  isSorting: boolean;
  isDragging: boolean;
  disableTransforms: boolean;
  forceDisabledTransition: boolean;
}): string | undefined {
  if (forceDisabledTransition) {
    return disabledTransition;
  }

  if (!transition || !isSorting || disableTransforms) {
    return undefined;
  }

  if (isDragging) {
    return undefined;
  }

  const resolvedTransition = {
    ...DEFAULT_SORTABLE_TRANSITION,
    ...transition,
  };

  return `transform ${resolvedTransition.duration}ms ${resolvedTransition.easing}`;
}

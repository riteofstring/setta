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

export function buildSortablePresentationState({
  activeIndex,
  activeRect,
  collisions,
  disableTransforms,
  dragTransform,
  index,
  isDragging,
  items,
  itemsHaveChanged,
  overIndex,
  shouldTrackSorting,
  sortedRects,
  sortingEnabled,
  strategy,
  transition,
  useDragOverlay,
  wasDragActive,
}: {
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
  useDragOverlay: boolean;
  wasDragActive: boolean;
}): {
  effectiveOverIndex: number;
  finalTransform: Transform | null;
  isDraggingActive: boolean;
  isSorting: boolean;
  transitionValue: string | undefined;
} {
  const relevantCollision = getTrackedCollision(
    collisions,
    items,
    overIndex,
    shouldTrackSorting,
  );
  const dragFlags = getDragFlags(
    activeIndex,
    index,
    isDragging,
    shouldTrackSorting,
  );
  const motionFlags = getMotionFlags({
    activeIndex,
    disableTransforms,
    isActiveItem: dragFlags.isActiveItem,
    isSorting: dragFlags.isSorting,
    itemsHaveChanged,
    overIndex,
    sortingEnabled,
    useDragOverlay,
    wasDragActive,
  });
  const transformState = resolveFinalTransformState({
    activeIndex,
    activeRect,
    dragTransform,
    index,
    overIndex,
    pastHalfway: relevantCollision?.pastHalfway ?? null,
    shouldDisplaceActiveItem: motionFlags.shouldDisplaceActiveItem,
    shouldDisplaceItem: motionFlags.shouldDisplaceItem,
    sortedRects,
    strategy,
  });

  return {
    effectiveOverIndex: transformState.effectiveOverIndex,
    finalTransform: transformState.finalTransform,
    isDraggingActive: dragFlags.isDraggingActive,
    isSorting: dragFlags.isSorting,
    transitionValue: getTransitionValue({
      transition,
      isSorting: dragFlags.isSorting,
      isDragging: dragFlags.isDraggingActive,
      useDragOverlay,
      disableTransforms,
      forceDisabledTransition: motionFlags.shouldDisableTransition,
    }),
  };
}

function getTrackedCollision(
  collisions: SettaCollision[] | null,
  items: UniqueIdentifier[],
  overIndex: number,
  shouldTrackSorting: boolean,
): SettaCollision | null {
  if (!shouldTrackSorting) {
    return null;
  }

  const preferredId = isValidIndex(overIndex) ? items[overIndex] : null;
  return getRelevantCollision(collisions, items, preferredId);
}

function getDragFlags(
  activeIndex: number,
  index: number,
  isDragging: boolean,
  shouldTrackSorting: boolean,
): {
  isActiveItem: boolean;
  isDraggingActive: boolean;
  isSorting: boolean;
} {
  const isSorting = shouldTrackSorting && activeIndex !== -1;
  const isActiveItem = index === activeIndex && activeIndex !== -1;
  return {
    isActiveItem,
    isDraggingActive: isDragging || (isSorting && isActiveItem),
    isSorting,
  };
}

function getMotionFlags({
  activeIndex,
  disableTransforms,
  isActiveItem,
  isSorting,
  itemsHaveChanged,
  overIndex,
  sortingEnabled,
  useDragOverlay,
  wasDragActive,
}: {
  activeIndex: number;
  disableTransforms: boolean;
  isActiveItem: boolean;
  isSorting: boolean;
  itemsHaveChanged: boolean;
  overIndex: number;
  sortingEnabled: boolean;
  useDragOverlay: boolean;
  wasDragActive: boolean;
}): {
  shouldDisableTransition: boolean;
  shouldDisplaceActiveItem: boolean;
  shouldDisplaceItem: boolean;
} {
  return {
    shouldDisableTransition:
      sortingEnabled && wasDragActive && itemsHaveChanged,
    shouldDisplaceActiveItem:
      isSorting && !useDragOverlay && isActiveItem && !disableTransforms,
    shouldDisplaceItem:
      isSorting &&
      !disableTransforms &&
      isValidIndex(activeIndex) &&
      isValidIndex(overIndex),
  };
}

function resolveFinalTransformState({
  activeIndex,
  activeRect,
  dragTransform,
  index,
  overIndex,
  pastHalfway,
  shouldDisplaceActiveItem,
  shouldDisplaceItem,
  sortedRects,
  strategy,
}: {
  activeIndex: number;
  activeRect: ClientRect | null;
  dragTransform: Transform | null;
  index: number;
  overIndex: number;
  pastHalfway: boolean | null;
  shouldDisplaceActiveItem: boolean;
  shouldDisplaceItem: boolean;
  sortedRects: Array<ClientRect | undefined>;
  strategy: SortingStrategy;
}): {
  effectiveOverIndex: number;
  finalTransform: Transform | null;
} {
  if (shouldDisplaceActiveItem) {
    return {
      effectiveOverIndex: overIndex,
      finalTransform: dragTransform,
    };
  }

  if (!shouldDisplaceItem) {
    return {
      effectiveOverIndex: overIndex,
      finalTransform: null,
    };
  }

  const result = strategy({
    rects: sortedRects,
    activeNodeRect: activeRect,
    activeIndex,
    overIndex,
    index,
    pastHalfway: pastHalfway ?? undefined,
  });
  const resolved = resolveStrategyResult(result, overIndex);
  return {
    effectiveOverIndex: resolved.overIndex,
    finalTransform: resolved.transform,
  };
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
  useDragOverlay,
  disableTransforms,
  forceDisabledTransition,
}: {
  transition: SortableTransition | null | undefined;
  isSorting: boolean;
  isDragging: boolean;
  useDragOverlay: boolean;
  disableTransforms: boolean;
  forceDisabledTransition: boolean;
}): string | undefined {
  if (forceDisabledTransition) {
    return disabledTransition;
  }

  if (!transition || !isSorting || disableTransforms) {
    return undefined;
  }

  if (isDragging && !useDragOverlay) {
    return undefined;
  }

  const resolvedTransition = {
    ...DEFAULT_SORTABLE_TRANSITION,
    ...transition,
  };

  return `transform ${resolvedTransition.duration}ms ${resolvedTransition.easing}`;
}

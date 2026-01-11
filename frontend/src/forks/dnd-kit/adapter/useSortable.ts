import { useContext, useEffect, useMemo, useRef } from "react";
import { useComputed } from "@dnd-kit/react/hooks";
import type { UniqueIdentifier } from "@dnd-kit/abstract";
import { useDragDropManager } from "@dnd-kit/react";
import type { Coordinates } from "@dnd-kit/geometry";
import { Context } from "./SortableContext";
import type {
  ClientRect,
  Disabled,
  SettaCollision,
  SortingStrategy,
  Transform,
} from "./types";
import {
  isValidIndex,
  resolveStrategyResult,
  rectSortingStrategy,
} from "./sorting";
import { useDraggable } from "./useDraggable";
import { useDroppable } from "./useDroppable";
import { useDndMode } from "../dndState";

const DEBUG_DND_SORTING = true;
const DEBUG_DND_SORTING_VERBOSE = true;

type SortableItemDebugState = {
  activeId: string;
  containerId: string;
  index: number;
  activeIndex: number;
  overIndex: number;
  effectiveOverIndex: number;
  overId: string | null;
  effectiveOverId: string | null;
  pastHalfway: boolean | null;
  isSorting: boolean;
  displaceItem: boolean;
  disableTransforms: boolean;
  useDragOverlay: boolean;
};

function logDndSorting(label: string, data: Record<string, unknown>) {
  if (!DEBUG_DND_SORTING) {
    return;
  }

  console.log("[dnd-sorting]", label, data);
}

export type SortableTransition = {
  duration?: number;
  easing?: string;
};

export type UseSortableArguments = {
  id: UniqueIdentifier;
  data?: Record<string, unknown>;
  disabled?: boolean | Disabled;
  attributes?: Record<string, unknown>;
  strategy?: SortingStrategy;
  transition?: SortableTransition | null;
  animateLayoutChanges?: () => boolean;
};

const defaultTransition = {
  duration: 250,
  easing: "cubic-bezier(0.25, 1, 0.5, 1)",
};

export function useSortable({
  attributes,
  data: customData,
  disabled: localDisabled,
  id,
  strategy: localStrategy,
  transition = defaultTransition,
}: UseSortableArguments) {
  const {
    items,
    containerId,
    activeIndex,
    disabled: globalDisabled,
    disableTransforms,
    sortedRects,
    overIndex,
    useDragOverlay,
    strategy: globalStrategy,
  } = useContext(Context);
  const disabled = normalizeLocalDisabled(localDisabled, globalDisabled);
  const index = items.indexOf(id);
  const dndMode = useDndMode();
  const feedback = dndMode.isSorting ? "none" : undefined;
  const data = useMemo(
    () => ({
      sortable: {
        containerId,
        index,
        items,
      },
      ...(customData ?? {}),
    }),
    [containerId, customData, index, items],
  );
  const { setNodeRef: setDroppableNodeRef, isOver } = useDroppable({
    id,
    data,
    disabled: disabled.droppable,
  });
  const {
    setNodeRef: setDraggableNodeRef,
    listeners,
    isDragging,
  } = useDraggable({
    id,
    data,
    attributes,
    disabled: disabled.draggable,
    feedback,
  });
  const setNodeRef = (element: Element | null) => {
    setDroppableNodeRef(element);
    setDraggableNodeRef(element);
  };
  const manager = useDragDropManager();
  const activeRect = useComputed(
    () =>
      manager?.dragOperation.shape?.current
        ? toClientRect(manager.dragOperation.shape.current.boundingRectangle)
        : null,
    [manager],
  ).value;
  const dragTransform = useComputed(
    () => toTransform(manager?.dragOperation.transform),
    [manager],
  ).value;
  const collisions = useComputed(
    () => manager?.collisionObserver.collisions ?? null,
    [manager],
  ).value as SettaCollision[] | null;
  const overIdFromIndex = isValidIndex(overIndex) ? items[overIndex] : null;
  const relevantCollision = getRelevantCollision(
    collisions,
    items,
    overIdFromIndex,
  );
  const pastHalfway = relevantCollision?.pastHalfway;
  const isSorting = dndMode.isSorting && activeIndex !== -1;
  const isActiveItem = index === activeIndex && activeIndex !== -1;
  const isDraggingActive = isDragging || (isSorting && isActiveItem);
  const displaceItem =
    isSorting &&
    !disableTransforms &&
    isValidIndex(activeIndex) &&
    isValidIndex(overIndex);
  const shouldDisplaceActiveItem =
    isSorting && !useDragOverlay && isActiveItem;
  const strategy = localStrategy ?? globalStrategy ?? rectSortingStrategy;

  let finalTransform: Transform | null = null;
  let effectiveOverIndex = overIndex;

  if (shouldDisplaceActiveItem) {
    finalTransform = dragTransform;
  } else if (displaceItem) {
    const result = strategy({
      rects: sortedRects,
      activeNodeRect: activeRect,
      activeIndex,
      overIndex,
      index,
      pastHalfway,
    });
    const resolved = resolveStrategyResult(result, overIndex);
    finalTransform = resolved.transform;
    effectiveOverIndex = resolved.overIndex;
  }

  const transitionValue = getTransitionValue({
    transition,
    isSorting,
    isDragging: isDraggingActive,
    useDragOverlay,
  });
  const debugRef = useRef<SortableItemDebugState | null>(null);

  useEffect(() => {
    if (!DEBUG_DND_SORTING) {
      return;
    }

    if (!isDraggingActive) {
      if (debugRef.current) {
        debugRef.current = null;
      }
      return;
    }

    let overId: UniqueIdentifier | null = null;
    if (isValidIndex(overIndex)) {
      overId = items[overIndex];
    }

    let effectiveOverId: UniqueIdentifier | null = null;
    if (isValidIndex(effectiveOverIndex)) {
      effectiveOverId = items[effectiveOverIndex];
    }

    const nextState: SortableItemDebugState = {
      activeId: String(id),
      containerId,
      index,
      activeIndex,
      overIndex,
      effectiveOverIndex,
      overId: overId ? String(overId) : null,
      effectiveOverId: effectiveOverId ? String(effectiveOverId) : null,
      pastHalfway: pastHalfway ?? null,
      isSorting,
      displaceItem,
      disableTransforms,
      useDragOverlay,
    };

    const prevState = debugRef.current;
    let shouldLog = false;
    if (!prevState) {
      shouldLog = true;
    } else if (
      prevState.activeId !== nextState.activeId ||
      prevState.containerId !== nextState.containerId ||
      prevState.index !== nextState.index ||
      prevState.activeIndex !== nextState.activeIndex ||
      prevState.overIndex !== nextState.overIndex ||
      prevState.effectiveOverIndex !== nextState.effectiveOverIndex ||
      prevState.overId !== nextState.overId ||
      prevState.effectiveOverId !== nextState.effectiveOverId ||
      prevState.pastHalfway !== nextState.pastHalfway ||
      prevState.isSorting !== nextState.isSorting ||
      prevState.displaceItem !== nextState.displaceItem ||
      prevState.disableTransforms !== nextState.disableTransforms ||
      prevState.useDragOverlay !== nextState.useDragOverlay
    ) {
      shouldLog = true;
    }

    if (shouldLog) {
      logDndSorting("sortable-item", {
        ...nextState,
        itemsLength: items.length,
      });

      if (DEBUG_DND_SORTING_VERBOSE) {
        logDndSorting("sortable-item-transform", {
          activeId: String(id),
          dragTransform,
          finalTransform,
          transition: transitionValue,
        });
      }
    }

    debugRef.current = nextState;
  }, [
    activeIndex,
    containerId,
    disableTransforms,
    displaceItem,
    dragTransform,
    effectiveOverIndex,
    finalTransform,
    id,
    index,
    isDraggingActive,
    isSorting,
    items,
    overIndex,
    pastHalfway,
    transitionValue,
    useDragOverlay,
  ]);

  return {
    attributes: attributes ?? {},
    listeners: listeners ?? {},
    setNodeRef,
    transform: finalTransform,
    transition: transitionValue,
    overIndex: effectiveOverIndex,
    items,
    isOver,
    isSorting,
    isDragging: isDraggingActive,
  };
}

function normalizeLocalDisabled(
  localDisabled: UseSortableArguments["disabled"],
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

function toTransform(transform: Coordinates | undefined): Transform {
  return {
    x: transform?.x ?? 0,
    y: transform?.y ?? 0,
    scaleX: 1,
    scaleY: 1,
  };
}

function getRelevantCollision(
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

function toClientRect(rect: ClientRect): ClientRect {
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
}: {
  transition: SortableTransition | null | undefined;
  isSorting: boolean;
  isDragging: boolean;
  useDragOverlay: boolean;
}): string | undefined {
  if (!transition || !isSorting) {
    return undefined;
  }

  if (isDragging && !useDragOverlay) {
    return undefined;
  }

  const resolvedTransition = {
    ...defaultTransition,
    ...transition,
  };

  return `transform ${resolvedTransition.duration}ms ${resolvedTransition.easing}`;
}

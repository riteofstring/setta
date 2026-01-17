import { useContext, useEffect, useMemo } from "react";
import { useComputed } from "@dnd-kit/react/hooks";
import type { UniqueIdentifier } from "@dnd-kit/abstract";
import {
  RestrictToHorizontalAxis,
  RestrictToVerticalAxis,
} from "@dnd-kit/abstract/modifiers";
import { SortableKeyboardPlugin } from "@dnd-kit/dom/sortable";
import type { Coordinates } from "@dnd-kit/geometry";
import { useDragDropManager } from "@dnd-kit/react";
import { useSortable as useDndKitSortable } from "@dnd-kit/react/sortable";
import { getSectionIsHorizontalOrientation } from "state/actions/sectionInfos";
import { Context } from "./SortableContext";
import type {
  ClientRect,
  Disabled,
  DndData,
  SettaCollision,
  SortingStrategy,
  Transform,
} from "./types";
import {
  isValidIndex,
  resolveStrategyResult,
  rectSortingStrategy,
} from "./sorting";
import { useCollisionDetector } from "./useCollisionDetector";
import { useDndMode } from "../dndState";

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
  const manager = useDragDropManager();
  const isDragActive = useComputed(
    () => {
      if (!manager) {
        return false;
      }

      const status = manager.dragOperation.status;
      return status.dragging || status.initializing;
    },
    [manager],
  ).value;
  const shouldTrackSorting = dndMode.isSorting && isDragActive;
  const disableFeedback = dndMode.isSorting;
  const feedback = disableFeedback ? "none" : undefined;
  const sortableTransition = shouldTrackSorting ? transition : null;
  let dragModifiers;
  if (dndMode.isSorting) {
    const containerIsHorizontal = getSectionIsHorizontalOrientation(containerId);
    dragModifiers = [
      containerIsHorizontal ? RestrictToHorizontalAxis : RestrictToVerticalAxis,
    ];
  }
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
  const wrappedData = useMemo<DndData | undefined>(() => {
    if (!data) {
      return undefined;
    }

    return { current: data };
  }, [data]);
  const collisionDetector = useCollisionDetector();
  const {
    sortable,
    ref: setNodeRef,
    isDragging,
    isDropTarget,
  } = useDndKitSortable({
    id,
    data: wrappedData,
    index,
    group: containerId,
    feedback,
    modifiers: dragModifiers,
    collisionDetector,
    transition: sortableTransition,
    // Skip OptimisticSortingPlugin; Setta controls reorder/placeholder behavior.
    plugins: [SortableKeyboardPlugin],
  });
  const listeners = {};
  const isOver = isDropTarget;
  const activeRect = useComputed(
    () => {
      if (!shouldTrackSorting) {
        return null;
      }

      return manager?.dragOperation.shape?.current
        ? toClientRect(manager.dragOperation.shape.current.boundingRectangle)
        : null;
    },
    [manager, shouldTrackSorting],
  ).value;
  const dragTransform = useComputed(
    () => {
      if (!shouldTrackSorting) {
        return null;
      }

      return toTransform(manager?.dragOperation.transform);
    },
    [manager, shouldTrackSorting],
  ).value;
  const collisions = useComputed(
    () => {
      if (!shouldTrackSorting) {
        return null;
      }

      return manager?.collisionObserver.collisions ?? null;
    },
    [manager, shouldTrackSorting],
  ).value as SettaCollision[] | null;
  const overIdFromIndex = isValidIndex(overIndex) ? items[overIndex] : null;
  const relevantCollision = shouldTrackSorting
    ? getRelevantCollision(collisions, items, overIdFromIndex)
    : null;
  const pastHalfway = relevantCollision?.pastHalfway ?? null;
  const isSorting = shouldTrackSorting && activeIndex !== -1;
  const isActiveItem = index === activeIndex && activeIndex !== -1;
  const isDraggingActive = isDragging || (isSorting && isActiveItem);
  const displaceItem =
    isSorting &&
    !disableTransforms &&
    isValidIndex(activeIndex) &&
    isValidIndex(overIndex);
  const shouldDisplaceActiveItem =
    isSorting && !useDragOverlay && isActiveItem && !disableTransforms;
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
    disableTransforms,
  });

  useEffect(() => {
    sortable.draggable.disabled = Boolean(disabled.draggable);
    sortable.droppable.disabled = Boolean(disabled.droppable);
  }, [disabled, sortable]);

  useEffect(() => {
    if (dndMode.isSorting && isDragActive) {
      sortable.transition = transition ?? null;
      return;
    }

    sortable.transition = null;
  }, [dndMode.isSorting, isDragActive, sortable, transition]);

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
  disableTransforms,
}: {
  transition: SortableTransition | null | undefined;
  isSorting: boolean;
  isDragging: boolean;
  useDragOverlay: boolean;
  disableTransforms: boolean;
}): string | undefined {
  if (!transition || !isSorting || disableTransforms) {
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

import { useContext, useMemo } from "react";
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
  const dndMode = useDndMode();
  const isSorting = dndMode.isSorting && activeIndex !== -1;
  const displaceItem =
    isSorting &&
    !disableTransforms &&
    isValidIndex(activeIndex) &&
    isValidIndex(overIndex);
  const shouldDisplaceDragSource = !useDragOverlay && isDragging;
  const dragSourceDisplacement =
    shouldDisplaceDragSource && displaceItem ? dragTransform : null;
  const strategy = localStrategy ?? globalStrategy ?? rectSortingStrategy;

  let finalTransform: Transform | null = null;
  let effectiveOverIndex = overIndex;

  if (displaceItem) {
    if (dragSourceDisplacement) {
      finalTransform = dragSourceDisplacement;
    } else {
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
  }

  const transitionValue = getTransitionValue({
    transition,
    isSorting,
  });

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
    isDragging,
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
}: {
  transition: SortableTransition | null | undefined;
  isSorting: boolean;
}): string | undefined {
  if (!transition || !isSorting) {
    return undefined;
  }

  const resolvedTransition = {
    ...defaultTransition,
    ...transition,
  };

  return `transform ${resolvedTransition.duration}ms ${resolvedTransition.easing}`;
}

import type { UniqueIdentifier } from "@dnd-kit/abstract";
import {
  RestrictToHorizontalAxis,
  RestrictToVerticalAxis,
} from "@dnd-kit/abstract/modifiers";
import { SortableKeyboardPlugin } from "@dnd-kit/dom/sortable";
import { useDragDropManager } from "@dnd-kit/react";
import { useComputed } from "@dnd-kit/react/hooks";
import { useSortable as useDndKitSortable } from "@dnd-kit/react/sortable";
import { useContext, useEffect, useMemo, useRef } from "react";
import {
  getSectionInfo,
  getSectionIsHorizontalOrientation,
} from "state/actions/sectionInfos";
import { useDndProviderContext } from "./DndProviderContext";
import { Context } from "./SortableContext";
import { itemsEqual, rectSortingStrategy } from "./sorting";
import type {
  ClientRect,
  Disabled,
  DndData,
  SettaCollision,
  SortingStrategy,
} from "./types";
import { useCollisionDetector } from "./useCollisionDetector";
import {
  DEFAULT_SORTABLE_TRANSITION,
  buildSortablePresentationState,
  normalizeLocalDisabled,
  toClientRect,
  toTransform,
  type SortableTransition,
} from "./useSortableModel";

type UseSortableArguments = {
  id: UniqueIdentifier;
  data?: Record<string, unknown>;
  disabled?: boolean | Disabled;
  attributes?: Record<string, unknown>;
  strategy?: SortingStrategy;
  transition?: SortableTransition | null;
  animateLayoutChanges?: () => boolean;
};

const dragDeactivationDelayMs = 50;
const emptyAttributes = {};
const emptyListeners = {};

export function useSortable({
  attributes,
  data: customData,
  disabled: localDisabled,
  id,
  strategy: localStrategy,
  transition = DEFAULT_SORTABLE_TRANSITION,
}: UseSortableArguments) {
  const {
    items,
    containerId,
    activeIndex,
    disabled: globalDisabled,
    disableTransforms,
    sortedRects,
    overIndex,
    sortingEnabled,
    useDragOverlay,
    strategy: globalStrategy,
  } = useContext(Context);
  const disabled = normalizeLocalDisabled(localDisabled, globalDisabled);
  const index = items.indexOf(id);
  const { isSorting: isSortingMode, isMovingFree } = useDndProviderContext();
  const manager = useDragDropManager();
  const isDragActive = useIsDragActive(manager);
  const shouldTrackSorting = sortingEnabled && isDragActive;
  const sortablePlugins = [SortableKeyboardPlugin];
  const feedback = getFeedback(sortingEnabled, isMovingFree, customData);
  const sortableTransition = getSortableTransition(
    transition,
    shouldTrackSorting,
  );
  const dragModifiers = getDragModifiers(isSortingMode, containerId);
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
    handleRef: setActivatorNodeRef,
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
    // Keep Setta's custom transform-based sortable behavior for list sortables.
    // Optimistic DOM reordering can cause scroll jumps in constrained panes.
    plugins: sortablePlugins,
  });
  const isOver = isDropTarget;
  const { activeRect, dragTransform, collisions } = useDragOperationState(
    manager,
    shouldTrackSorting,
  );
  const itemsHaveChanged = useItemsHaveChanged(items);
  const wasDragActive = useWasDragActive(isDragActive);
  const strategy = localStrategy ?? globalStrategy ?? rectSortingStrategy;
  const presentation = buildSortablePresentationState({
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
  });
  useSyncSortableDisabled(sortable, disabled);
  useSyncSortableTransition(
    sortable,
    sortingEnabled,
    isDragActive,
    presentation.isDraggingActive,
    transition,
  );

  return {
    attributes: attributes ?? emptyAttributes,
    listeners: emptyListeners,
    setNodeRef,
    setActivatorNodeRef,
    transform: presentation.finalTransform,
    transition: presentation.transitionValue,
    overIndex: presentation.effectiveOverIndex,
    items,
    isOver,
    isSorting: presentation.isSorting,
    isDragging: presentation.isDraggingActive,
  };
}

function getFeedback(
  sortingEnabled: boolean,
  isMovingFree: boolean,
  customData: Record<string, unknown> | undefined,
): "none" | undefined {
  const itemType =
    typeof customData?.type === "string" ? customData.type : null;
  return sortingEnabled || isMovingFree || itemType === "param"
    ? "none"
    : undefined;
}

function getSortableTransition(
  transition: SortableTransition | null | undefined,
  shouldTrackSorting: boolean,
): SortableTransition | null {
  return shouldTrackSorting ? transition ?? null : null;
}

function getDragModifiers(isSortingMode: boolean, containerId: string) {
  if (!isSortingMode) {
    return undefined;
  }

  const containerIsHorizontal =
    getSectionInfo(containerId) !== undefined &&
    getSectionIsHorizontalOrientation(containerId);
  return [
    containerIsHorizontal ? RestrictToHorizontalAxis : RestrictToVerticalAxis,
  ];
}

function useIsDragActive(manager: ReturnType<typeof useDragDropManager>) {
  return useComputed(() => {
    if (!manager) {
      return false;
    }

    const status = manager.dragOperation.status;
    return status.dragging || status.initializing;
  }, [manager]).value;
}

function useDragOperationState(
  manager: ReturnType<typeof useDragDropManager>,
  shouldTrackSorting: boolean,
): {
  activeRect: ClientRect | null;
  collisions: SettaCollision[] | null;
  dragTransform: ReturnType<typeof toTransform> | null;
} {
  const activeRect = useComputed(() => {
    if (!shouldTrackSorting) {
      return null;
    }

    return manager?.dragOperation.shape?.current
      ? toClientRect(manager.dragOperation.shape.current.boundingRectangle)
      : null;
  }, [manager, shouldTrackSorting]).value;
  const dragTransform = useComputed(() => {
    if (!shouldTrackSorting) {
      return null;
    }

    return toTransform(manager?.dragOperation.transform);
  }, [manager, shouldTrackSorting]).value;
  const collisions = useComputed(() => {
    if (!shouldTrackSorting) {
      return null;
    }

    return manager?.collisionObserver.collisions ?? null;
  }, [manager, shouldTrackSorting]).value as SettaCollision[] | null;

  return {
    activeRect,
    collisions,
    dragTransform,
  };
}

function useItemsHaveChanged(items: UniqueIdentifier[]): boolean {
  const previousItemsRef = useRef(items);
  const itemsHaveChanged = !itemsEqual(items, previousItemsRef.current);

  useEffect(() => {
    previousItemsRef.current = items;
  }, [items]);

  return itemsHaveChanged;
}

function useWasDragActive(isDragActive: boolean): boolean {
  const wasDragActiveRef = useRef(false);

  useEffect(() => {
    if (isDragActive) {
      wasDragActiveRef.current = true;
      return undefined;
    }

    if (!wasDragActiveRef.current) {
      return undefined;
    }

    const timeoutId: ReturnType<typeof setTimeout> = setTimeout(() => {
      wasDragActiveRef.current = false;
    }, dragDeactivationDelayMs);

    return () => clearTimeout(timeoutId);
  }, [isDragActive]);

  return wasDragActiveRef.current;
}

function useSyncSortableDisabled(
  sortable: ReturnType<typeof useDndKitSortable>["sortable"],
  disabled: ReturnType<typeof normalizeLocalDisabled>,
) {
  useEffect(() => {
    sortable.draggable.disabled = Boolean(disabled.draggable);
    sortable.droppable.disabled = Boolean(disabled.droppable);
  }, [disabled, sortable]);
}

function useSyncSortableTransition(
  sortable: ReturnType<typeof useDndKitSortable>["sortable"],
  sortingEnabled: boolean,
  isDragActive: boolean,
  isDraggingActive: boolean,
  transition: SortableTransition | null | undefined,
) {
  useEffect(() => {
    if (sortingEnabled && isDragActive && !isDraggingActive) {
      sortable.transition = transition ?? null;
      return;
    }

    sortable.transition = null;
  }, [sortingEnabled, isDragActive, isDraggingActive, sortable, transition]);
}

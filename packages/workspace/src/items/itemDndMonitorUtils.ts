import { computeNewIndex } from "../dnd/adapter/index.js";
import type { SettaCollision } from "../dnd/adapter/types.js";
import type { ItemListKey } from "../dnd/itemDndState.js";

type ItemOverlayVisibilityInput = {
  shouldRenderOverlay: boolean;
  isItemDragActive: boolean;
  hasOverlayMetrics: boolean;
  suppressOverlay: boolean;
  isDropped: boolean;
  isDragging: boolean;
  isInitializing: boolean;
};

export function isItemOverlayVisible({
  shouldRenderOverlay,
  isItemDragActive,
  hasOverlayMetrics,
  suppressOverlay,
  isDropped,
  isDragging,
  isInitializing,
}: ItemOverlayVisibilityInput) {
  if (!shouldRenderOverlay || !isItemDragActive || !hasOverlayMetrics) {
    return false;
  }
  if (suppressOverlay || isDropped) {
    return false;
  }
  return isDragging || isInitializing;
}

type ItemPlaceholderMovePlanContext = {
  tempId: string;
  overId: string;
  oldParentId: string | null;
  newParentId: string;
  pastHalfway: boolean;
  newParentChildren: Array<string>;
};

type ItemPlaceholderMovePlan =
  | {
      type: "move-parent";
      index: number;
      overIndex: number;
    }
  | {
      type: "reorder";
      index: number;
      overIndex: number;
      activeIndex: number;
    };

export function resolveItemPlaceholderMovePlan(
  context: ItemPlaceholderMovePlanContext,
): ItemPlaceholderMovePlan | null {
  const overIndex = context.newParentChildren.indexOf(context.overId);
  if (context.newParentId !== context.oldParentId) {
    return {
      type: "move-parent",
      index: resolveParentInsertionIndex(context, overIndex),
      overIndex,
    };
  }

  const activeIndex = context.newParentChildren.indexOf(context.tempId);
  if (activeIndex < 0 || overIndex < 0 || context.overId === context.tempId) {
    return null;
  }

  const nextIndex = computeNewIndex(
    activeIndex,
    overIndex,
    context.pastHalfway,
    context.newParentChildren.length,
  );
  if (nextIndex === activeIndex) {
    return null;
  }

  return {
    type: "reorder",
    index: nextIndex,
    overIndex,
    activeIndex,
  };
}

function resolveParentInsertionIndex(
  context: ItemPlaceholderMovePlanContext,
  overIndex: number,
) {
  if (overIndex >= 0) {
    return context.pastHalfway ? overIndex + 1 : overIndex;
  }
  if (shouldInsertAtParentBoundary(context)) {
    return context.pastHalfway ? context.newParentChildren.length : 0;
  }
  return context.newParentChildren.length;
}

function shouldInsertAtParentBoundary({
  overId,
  newParentId,
  newParentChildren,
  tempId,
}: ItemPlaceholderMovePlanContext) {
  return (
    overId === newParentId &&
    newParentChildren.length > 0 &&
    !newParentChildren.includes(tempId)
  );
}

type CollisionDroppableData = {
  current?: {
    listKey?: ItemListKey | null;
  };
};

export function filterCollisionsForListKey(
  collisions: Array<SettaCollision> | null,
  listKey: ItemListKey | null,
): Array<SettaCollision> | null {
  if (!collisions || !listKey) {
    return collisions;
  }
  return collisions.filter((collision) => {
    const data = collision.data?.droppable?.data as
      CollisionDroppableData | undefined;
    return data?.current?.listKey === listKey;
  });
}

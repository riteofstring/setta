import { computeNewIndex } from "forks/dnd-kit/adapter";

type ParamOverlayVisibilityInput = {
  shouldRenderOverlay: boolean;
  isParamDragActive: boolean;
  hasOverlayMetrics: boolean;
  suppressOverlay: boolean;
  isDropped: boolean;
  isDragging: boolean;
  isInitializing: boolean;
};

export function isParamOverlayVisible({
  shouldRenderOverlay,
  isParamDragActive,
  hasOverlayMetrics,
  suppressOverlay,
  isDropped,
  isDragging,
  isInitializing,
}: ParamOverlayVisibilityInput) {
  if (!shouldRenderOverlay || !isParamDragActive || !hasOverlayMetrics) {
    return false;
  }
  if (suppressOverlay || isDropped) {
    return false;
  }
  return isDragging || isInitializing;
}

type ParamPlaceholderMovePlanContext = {
  tempId: string;
  overId: string;
  oldParentId: string | null;
  newParentId: string;
  pastHalfway: boolean;
  newParentChildren: string[];
};

type ParamPlaceholderMovePlan =
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

export function resolveParamPlaceholderMovePlan(
  context: ParamPlaceholderMovePlanContext,
): ParamPlaceholderMovePlan | null {
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
  context: ParamPlaceholderMovePlanContext,
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
}: ParamPlaceholderMovePlanContext) {
  return (
    overId === newParentId &&
    newParentChildren.length > 0 &&
    !newParentChildren.includes(tempId)
  );
}

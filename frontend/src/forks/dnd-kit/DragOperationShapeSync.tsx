import { Rectangle, type BoundingRectangle } from "@dnd-kit/geometry";
import { useDragDropManager } from "@dnd-kit/react";
import { useComputed } from "@dnd-kit/react/hooks";
import { effects } from "@dnd-kit/state";
import { useEffect, useRef, type MutableRefObject } from "react";
import { useDndProviderContext } from "./adapter/DndProviderContext";
import { useDndState } from "./dndState";
import { resolveRectBoundsById, type DragRectLike } from "./dragRectBounds";
import { useParamDndState } from "./paramDndState";

type DragOperationShapeSyncProps = {
  enabled?: boolean;
};

export function DragOperationShapeSync({
  enabled,
}: DragOperationShapeSyncProps = {}) {
  const manager = useDragDropManager();
  const { isSorting, isMovingFree } = useDndProviderContext();
  const {
    activeRect: sectionActiveRect,
    draggingIds,
    draggingRectsById,
  } = useDndState((x) => ({
    activeRect: x.activeRect,
    draggingIds: x.draggingIds,
    draggingRectsById: x.draggingRectsById,
  }));
  const paramActiveRect = useParamDndState((x) => x.activeRect);
  const activeDragType = useComputed(() => {
    const sourceData = manager?.dragOperation.source?.data as
      | { current?: { type?: string } }
      | undefined;
    return sourceData?.current?.type ?? null;
  }, [manager]).value;
  const shouldSync =
    enabled === undefined
      ? isSorting || isMovingFree || activeDragType === "param"
      : enabled;
  const baseRectRef = useRef<BoundingRectangle | null>(null);
  const activeIdRef = useRef<string | number | null>(null);

  useEffect(() => {
    if (!manager || !shouldSync) {
      resetDragBaseRefs(baseRectRef, activeIdRef);
      return;
    }

    return effects(() => {
      const nextShape = resolveNextDragOperationShape({
        manager,
        activeDragType,
        paramActiveRect,
        sectionActiveRect,
        draggingIds,
        draggingRectsById,
        isMovingFree,
        previousActiveId: activeIdRef.current,
        previousBaseRect: baseRectRef.current,
      });
      if (!nextShape) {
        resetDragBaseRefs(baseRectRef, activeIdRef);
        return;
      }

      updateDragBaseRefs(baseRectRef, activeIdRef, nextShape);
      manager.dragOperation.shape = nextShape.shape;
    });
  }, [
    manager,
    shouldSync,
    activeDragType,
    paramActiveRect,
    sectionActiveRect,
    draggingIds,
    draggingRectsById,
    isMovingFree,
  ]);

  return null;
}

type DragDropManager = NonNullable<ReturnType<typeof useDragDropManager>>;
type DragRect = DragRectLike;

type DragShape = {
  boundingRectangle: BoundingRectangle;
};

type DragDroppable =
  | {
      shape?: DragShape | null;
      refreshShape?: () => DragShape | null | undefined;
    }
  | null
  | undefined;

type ResolveDragBaseRectArgs = {
  activeId: string | number;
  previousActiveId: string | number | null;
  previousBaseRect: BoundingRectangle | null;
  selectionRect: BoundingRectangle | null;
  droppable: DragDroppable;
  fallbackRect: BoundingRectangle | null;
};

type ResolveDragBaseRectResult = {
  baseRect: BoundingRectangle | null;
  refreshedBaseRect: BoundingRectangle | null;
};

type ResolveNextDragOperationShapeArgs = {
  manager: DragDropManager;
  activeDragType: string | null;
  paramActiveRect: BoundingRectangle | null;
  sectionActiveRect: BoundingRectangle | null;
  draggingIds: string[];
  draggingRectsById: Record<string, DragRect> | null;
  isMovingFree: boolean;
  previousActiveId: string | number | null;
  previousBaseRect: BoundingRectangle | null;
};

type ResolvedDragOperationShape = {
  activeId: string | number;
  refreshedBaseRect: BoundingRectangle | null;
  shape: BoundingRectangle;
};

function resetDragBaseRefs(
  baseRectRef: MutableRefObject<BoundingRectangle | null>,
  activeIdRef: MutableRefObject<string | number | null>,
) {
  baseRectRef.current = null;
  activeIdRef.current = null;
}

function updateDragBaseRefs(
  baseRectRef: MutableRefObject<BoundingRectangle | null>,
  activeIdRef: MutableRefObject<string | number | null>,
  shape: ResolvedDragOperationShape,
) {
  if (!shape.refreshedBaseRect) {
    return;
  }

  baseRectRef.current = shape.refreshedBaseRect;
  activeIdRef.current = shape.activeId;
}

function resolveNextDragOperationShape({
  manager,
  activeDragType,
  paramActiveRect,
  sectionActiveRect,
  draggingIds,
  draggingRectsById,
  isMovingFree,
  previousActiveId,
  previousBaseRect,
}: ResolveNextDragOperationShapeArgs): ResolvedDragOperationShape | null {
  const active = manager.dragOperation.source;
  if (!manager.dragOperation.status.dragging || !active) {
    return null;
  }

  const activeId = active.id;
  const isParamDrag = activeDragType === "param";
  const { baseRect, refreshedBaseRect } = resolveDragBaseRect({
    activeId,
    previousActiveId,
    previousBaseRect,
    selectionRect: resolveSelectionBoundingRect({
      draggingIds,
      draggingRectsById,
      isMovingFree,
      isParamDrag,
    }),
    droppable: manager.registry.droppables.get(activeId),
    fallbackRect: isParamDrag ? paramActiveRect : sectionActiveRect,
  });
  if (!baseRect) {
    return null;
  }

  const transform = manager.dragOperation.transform;
  return {
    activeId,
    refreshedBaseRect,
    shape: Rectangle.from(baseRect).translate(
      transform?.x ?? 0,
      transform?.y ?? 0,
    ),
  };
}

export function resolveDragBaseRect({
  activeId,
  previousActiveId,
  previousBaseRect,
  selectionRect,
  droppable,
  fallbackRect,
}: ResolveDragBaseRectArgs): ResolveDragBaseRectResult {
  const needsFreshBaseRect =
    previousActiveId !== activeId || previousBaseRect === null;
  const refreshedBaseRect = needsFreshBaseRect
    ? resolveFreshDragBaseRect({
        selectionRect,
        droppable,
        fallbackRect,
      })
    : null;
  const storedBaseRect = refreshedBaseRect ?? previousBaseRect;

  return {
    baseRect: selectionRect ?? storedBaseRect ?? fallbackRect,
    refreshedBaseRect,
  };
}

function resolveFreshDragBaseRect({
  selectionRect,
  droppable,
  fallbackRect,
}: {
  selectionRect: BoundingRectangle | null;
  droppable: DragDroppable;
  fallbackRect: BoundingRectangle | null;
}): BoundingRectangle | null {
  if (selectionRect) {
    return selectionRect;
  }

  return (
    droppable?.refreshShape?.()?.boundingRectangle ??
    droppable?.shape?.boundingRectangle ??
    fallbackRect
  );
}

export function resolveSelectionBoundingRect({
  draggingIds,
  draggingRectsById,
  isMovingFree,
  isParamDrag,
}: {
  draggingIds: string[];
  draggingRectsById: Record<string, DragRect> | null;
  isMovingFree: boolean;
  isParamDrag: boolean;
}): BoundingRectangle | null {
  if (!isMovingFree || isParamDrag) {
    return null;
  }

  if (draggingIds.length < 2) {
    return null;
  }

  return resolveRectBoundsById(draggingIds, draggingRectsById);
}

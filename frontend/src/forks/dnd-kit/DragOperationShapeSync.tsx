import { Rectangle, type BoundingRectangle } from "@dnd-kit/geometry";
import { useDragDropManager } from "@dnd-kit/react";
import { useComputed } from "@dnd-kit/react/hooks";
import { effects } from "@dnd-kit/state";
import { useEffect, useRef } from "react";
import { useDndProviderContext } from "./adapter/DndProviderContext";
import { useDndState } from "./dndState";
import { useParamDndState } from "./paramDndState";

type DragOperationShapeSyncProps = {
  enabled?: boolean;
};

export function DragOperationShapeSync({
  enabled,
}: DragOperationShapeSyncProps = {}) {
  const manager = useDragDropManager();
  const { isSorting, isMovingFree } = useDndProviderContext();
  const sectionActiveRect = useDndState((x) => x.activeRect);
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
      baseRectRef.current = null;
      activeIdRef.current = null;
      return;
    }

    return effects(() => {
      const active = manager.dragOperation.source;
      const isDragging = manager.dragOperation.status.dragging;
      if (!isDragging || !active) {
        baseRectRef.current = null;
        activeIdRef.current = null;
        return;
      }

      const activeId = active.id;
      const droppable = manager.registry.droppables.get(activeId);
      const isParamDrag = activeDragType === "param";
      const fallbackRect = isParamDrag ? paramActiveRect : sectionActiveRect;

      const currentShape = droppable?.shape ?? null;
      if (activeIdRef.current !== activeId || !baseRectRef.current) {
        const refreshedShape = droppable?.refreshShape();
        const nextShape = refreshedShape ?? currentShape ?? null;
        if (nextShape) {
          baseRectRef.current = nextShape.boundingRectangle;
        } else if (fallbackRect) {
          baseRectRef.current = fallbackRect;
        } else {
          return;
        }
        activeIdRef.current = activeId;
      }

      const baseRect = baseRectRef.current ?? fallbackRect;
      if (!baseRect) {
        return;
      }

      const transform = manager.dragOperation.transform;
      manager.dragOperation.shape = Rectangle.from(baseRect).translate(
        transform?.x ?? 0,
        transform?.y ?? 0,
      );
    });
  }, [
    manager,
    shouldSync,
    activeDragType,
    paramActiveRect,
    sectionActiveRect,
  ]);

  return null;
}

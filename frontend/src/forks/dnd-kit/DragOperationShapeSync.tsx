import { Rectangle, type BoundingRectangle } from "@dnd-kit/geometry";
import { useDragDropManager } from "@dnd-kit/react";
import { effects } from "@dnd-kit/state";
import { useEffect, useRef } from "react";
import { useDndMode } from "./dndState";

type DragOperationShapeSyncProps = {
  enabled?: boolean;
};

export function DragOperationShapeSync({
  enabled,
}: DragOperationShapeSyncProps = {}) {
  const manager = useDragDropManager();
  const { isSorting } = useDndMode();
  const shouldSync = enabled === undefined ? isSorting : enabled;
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
      if (!droppable) {
        return;
      }

      const currentShape = droppable.shape ?? null;
      if (activeIdRef.current !== activeId || !baseRectRef.current) {
        const refreshedShape = droppable.refreshShape();
        const nextShape = refreshedShape ?? currentShape ?? null;
        if (!nextShape) {
          return;
        }

        baseRectRef.current = nextShape.boundingRectangle;
        activeIdRef.current = activeId;
      }

      const baseRect = baseRectRef.current;
      if (!baseRect) {
        return;
      }

      const transform = manager.dragOperation.transform;
      manager.dragOperation.shape = Rectangle.from(baseRect).translate(
        transform?.x ?? 0,
        transform?.y ?? 0,
      );
    });
  }, [manager, shouldSync]);

  return null;
}

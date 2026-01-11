import { useEffect } from "react";
import { Rectangle } from "@dnd-kit/geometry";
import { useDragDropManager } from "@dnd-kit/react";
import { useComputed } from "@dnd-kit/react/hooks";
import { useDndMode } from "./dndState";

export function DragOperationShapeSync() {
  const manager = useDragDropManager();
  const { isSorting } = useDndMode();
  const active = useComputed(
    () => manager?.dragOperation.source ?? null,
    [manager],
  ).value;
  const dragTransform = useComputed(
    () => manager?.dragOperation.transform,
    [manager],
  ).value;
  const isDragging = useComputed(
    () => manager?.dragOperation.status.dragging ?? false,
    [manager],
  ).value;

  useEffect(() => {
    if (!manager || !isSorting || !isDragging || !active) {
      return;
    }

    const activeId = active.id;
    const droppable = manager.registry.droppables.get(activeId);
    const baseShape = droppable?.shape ?? null;
    const transform = manager.dragOperation.transform;
    let nextShape: Rectangle | null = null;

    if (baseShape) {
      if (baseShape instanceof Rectangle) {
        nextShape = baseShape.translate(transform.x, transform.y);
      } else {
        nextShape = Rectangle.from(baseShape.boundingRectangle).translate(
          transform.x,
          transform.y,
        );
      }
    } else if (active.element) {
      const rect = active.element.getBoundingClientRect();
      nextShape = Rectangle.from(rect).translate(transform.x, transform.y);
    }

    if (nextShape) {
      manager.dragOperation.shape = nextShape;
    }
  }, [active, dragTransform, isDragging, isSorting, manager]);

  return null;
}

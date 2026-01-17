import { useDragDropManager } from "@dnd-kit/react";
import { useComputed } from "@dnd-kit/react/hooks";
import { useEffect } from "react";
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

    const droppable = manager.registry.droppables.get(active.id);
    if (!droppable) {
      return;
    }

    const refreshedShape = droppable.refreshShape();
    const nextShape = refreshedShape ?? droppable.shape ?? null;
    if (!nextShape) {
      return;
    }

    manager.dragOperation.shape = nextShape;
  }, [active, dragTransform, isDragging, isSorting, manager]);

  return null;
}

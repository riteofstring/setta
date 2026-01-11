import { useEffect } from "react";
import { DOMRectangle } from "@dnd-kit/dom/utilities";
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
    if (!manager || !isSorting || !isDragging || !active?.element) {
      return;
    }

    manager.dragOperation.shape = new DOMRectangle(active.element);
  }, [active, dragTransform, isDragging, isSorting, manager]);

  return null;
}

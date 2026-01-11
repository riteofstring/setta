import { setActiveDnd, useDndState } from "./dndState";
import type { DragOverEvent, DragStartEvent } from "./adapter";

export function onDragStart({ active }: DragStartEvent) {
  if (!active?.id) {
    return;
  }

  const activeId = String(active.id);
  setActiveDnd(activeId);
  useDndState.setState({ overId: null });
  console.log("[dnd] dragstart", { activeId });
}

export function useOnDragOver() {
  return onDragOver;
}

function onDragOver({ over }: DragOverEvent) {
  useDndState.setState({ overId: over ? String(over.id) : null });
}

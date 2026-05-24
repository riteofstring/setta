import { useDragDropManager } from "@dnd-kit/react";
import { useComputed } from "@dnd-kit/react/hooks";
import { useEffect } from "react";
import { forceDeactivateDnd, useDndState } from "./dndState";

export function DeferredDndDeactivation() {
  const manager = useDragDropManager();
  const pendingDeactivation = useDndState((state) => state.pendingDeactivation);
  const isDragging = useComputed(
    () => manager?.dragOperation.status.dragging ?? false,
    [manager],
  ).value;
  const isInitializing = useComputed(
    () => manager?.dragOperation.status.initializing ?? false,
    [manager],
  ).value;
  const isIdle = useComputed(
    () => manager?.dragOperation.status.idle ?? true,
    [manager],
  ).value;

  useEffect(() => {
    if (!pendingDeactivation || !manager) {
      return;
    }

    if (isDragging || isInitializing) {
      manager.actions.stop({ canceled: true });
      forceDeactivateDnd();
      return;
    }

    if (isIdle) {
      forceDeactivateDnd();
    }
  }, [isDragging, isIdle, isInitializing, manager, pendingDeactivation]);

  return null;
}

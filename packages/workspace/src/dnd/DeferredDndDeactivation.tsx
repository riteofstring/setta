import { useDragDropManager } from "@dnd-kit/react";
import { useComputed } from "@dnd-kit/react/hooks";
import { useEffect } from "react";
import { forceDeactivateDnd, useDndState } from "./dndState.js";
import { useWorkspaceHost } from "../workspaceHostContext.js";

export function DeferredDndDeactivation() {
  const host = useWorkspaceHost();
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
      forceDeactivateDnd(host);
      return;
    }

    if (isIdle) {
      forceDeactivateDnd(host);
    }
  }, [host, isDragging, isIdle, isInitializing, manager, pendingDeactivation]);

  return null;
}

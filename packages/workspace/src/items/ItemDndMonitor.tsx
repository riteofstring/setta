import { useDragDropManager } from "@dnd-kit/react";
import { useComputed } from "@dnd-kit/react/hooks";
import { useEffect } from "react";
import { useDndMonitor } from "../dnd/adapter";
import { useItemDndState } from "../dnd/itemDndState";
import { useItemSelectionMode } from "../document/itemSelectionMode";
import { useWorkspaceHost } from "../workspaceHostContext";
import {
  deferItemDragReset,
  handleItemDragCancel,
  handleItemDragEnd,
  handleItemDragMove,
  handleItemDragOver,
  handleItemDragStart,
  resetItemDragState,
} from "./itemDragHandlers";

// The reference's `ParamDndMonitor` component: wires the drag lifecycle handlers into the
// nested item provider, cancels a live item drag when item-select mode releases mid-gesture,
// and completes the deferred reset once the drag operation returns to idle.

export function ItemDndMonitor() {
  const host = useWorkspaceHost();
  const manager = useDragDropManager();
  const pendingReset = useItemDndState((state) => state.pendingReset);
  const isSelectingItems = useItemSelectionMode(
    (state) => state.isSelectingItems,
  );
  const isIdle = useComputed(
    () => manager?.dragOperation.status.idle ?? true,
    [manager],
  ).value;
  const isDragging = useComputed(
    () => manager?.dragOperation.status.dragging ?? false,
    [manager],
  ).value;
  const isInitializing = useComputed(
    () => manager?.dragOperation.status.initializing ?? false,
    [manager],
  ).value;

  useEffect(() => {
    if (isSelectingItems || !manager) {
      return;
    }
    if (!isDragging && !isInitializing) {
      return;
    }
    const sourceData = manager.dragOperation.source?.data as
      { current?: { type?: string } } | undefined;
    if (sourceData?.current?.type !== "item") {
      return;
    }
    manager.actions.stop({ canceled: true });
    deferItemDragReset(host);
  }, [host, isDragging, isInitializing, isSelectingItems, manager]);

  useEffect(() => {
    if (!pendingReset || !isIdle) {
      return;
    }
    resetItemDragState(host);
  }, [host, isIdle, pendingReset]);

  useDndMonitor({
    onDragStart: (event) => handleItemDragStart(host, event, manager),
    onDragMove: (event) => handleItemDragMove(host, event),
    onDragOver: (event) => handleItemDragOver(host, event),
    onDragEnd: () => handleItemDragEnd(host),
    onDragCancel: () => handleItemDragCancel(host),
  });

  return null;
}

import { useDragDropManager } from "@dnd-kit/react";
import { useComputed } from "@dnd-kit/react/hooks";
import { useEffect } from "react";
import { useDndMonitor } from "../dnd/adapter";
import { useItemDndState } from "../dnd/itemDndState";
import { useItemSelectionMode } from "../document/itemSelectionMode";
import { useWorkspaceCapabilities } from "../document/capabilities";
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

export function ItemDndMonitor() {
  const host = useWorkspaceHost();
  const manager = useDragDropManager();
  const canEditStructure = useWorkspaceCapabilities(
    (state) => state.canEditStructure,
  );
  const pendingReset = useItemDndState((state) => state.pendingReset);
  const isHandleDrag = useItemDndState((state) => state.isHandleDrag);
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

  const mayContinueDrag =
    canEditStructure && (isSelectingItems || isHandleDrag);
  useEffect(() => {
    if (!manager) return;
    if (mayContinueDrag) return;
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
  }, [host, isDragging, isInitializing, mayContinueDrag, manager]);

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

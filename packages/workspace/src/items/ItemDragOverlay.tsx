import type { DragDropManager } from "@dnd-kit/dom";
import { useDragDropManager } from "@dnd-kit/react";
import { useComputed } from "@dnd-kit/react/hooks";
import _ from "lodash";
import { useState } from "react";
import { createPortal } from "react-dom";
import { useDndMonitor } from "../dnd/adapter";
import type { DragStartEvent } from "../dnd/adapter/types";
import { useItemDndState } from "../dnd/itemDndState";
import { useWorkspaceScopeClassName } from "../styles/workspaceScope";
import { isItemOverlayVisible } from "./itemDndMonitorUtils";

// The reference's `ParamDragOverlay`: the fixed blue drag rectangle that follows the pointer
// at the measured multi-item placeholder size while the temp placeholder holds the drop slot.
// Portaled to document.body, so it carries the package scope marker class.

type ItemDragEventData = { current?: { type?: string } };

export function ItemDragOverlay() {
  const manager = useDragDropManager();
  const [suppressOverlay, setSuppressOverlay] = useState(false);
  const workspaceScopeClassName = useWorkspaceScopeClassName();

  useItemDragOverlayMonitor(setSuppressOverlay);
  const { overlayMetrics, overlayRect, canRenderOverlay } = useItemDragOverlayState(
    manager,
    suppressOverlay,
  );

  if (!canRenderOverlay || !overlayMetrics) {
    return null;
  }

  return createPortal(
    overlayRect ? (
      <div
        className={`${workspaceScopeClassName} rounded-sm bg-blue-600/80 shadow-md dark:bg-blue-700/70`}
        style={{
          position: "fixed",
          top: overlayRect.top,
          left: overlayRect.left,
          width: overlayMetrics.width,
          height: overlayMetrics.height,
          pointerEvents: "none",
          zIndex: 1000,
        }}
      />
    ) : null,
    document.body,
  );
}

function useItemDragOverlayMonitor(setSuppressOverlay: (nextValue: boolean) => void) {
  useDndMonitor({
    onDragStart: (event) => {
      updateItemOverlaySuppression({ event, nextValue: false, setSuppressOverlay });
    },
    onDragEnd: (event) => {
      updateItemOverlaySuppression({ event, nextValue: true, setSuppressOverlay });
    },
    onDragCancel: (event) => {
      updateItemOverlaySuppression({ event, nextValue: true, setSuppressOverlay });
    },
  });
}

function useItemDragOverlayState(manager: DragDropManager | null, suppressOverlay: boolean) {
  const activeDragType = useComputed(() => {
    const sourceData = manager?.dragOperation.source?.data as ItemDragEventData | undefined;
    return sourceData?.current?.type ?? null;
  }, [manager]).value;
  const isItemDragActive = activeDragType === "item";
  const { activeId, placeholderWidth, placeholderHeight, activeRect } = useItemDndState(
    (state) => ({
      activeId: state.activeId,
      placeholderWidth: state.placeholderWidth,
      placeholderHeight: state.placeholderHeight,
      activeRect: state.activeRect,
    }),
    _.isEqual,
  );
  const dragTransform = useComputed(() => {
    if (!manager) {
      return null;
    }
    const transform = manager.dragOperation.transform;
    return {
      x: transform?.x ?? 0,
      y: transform?.y ?? 0,
    };
  }, [manager]).value;
  const isDropped = useComputed(
    () => manager?.dragOperation.status.dropped ?? false,
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
  const shouldRenderOverlay = useComputed(
    () => manager?.dragOperation.status.initialized ?? false,
    [manager],
  ).value;
  const overlayMetrics = activeId
    ? {
        width: placeholderWidth ?? 220,
        height: placeholderHeight ?? 32,
      }
    : null;
  const overlayRect = activeRect
    ? {
        top: activeRect.top + (dragTransform?.y ?? 0),
        left: activeRect.left + (dragTransform?.x ?? 0),
        width: activeRect.width,
        height: activeRect.height,
      }
    : null;
  const canRenderOverlay = isItemOverlayVisible({
    shouldRenderOverlay,
    isItemDragActive,
    hasOverlayMetrics: overlayMetrics !== null,
    suppressOverlay,
    isDropped,
    isDragging,
    isInitializing,
  });

  return {
    overlayMetrics,
    overlayRect,
    canRenderOverlay,
  };
}

function updateItemOverlaySuppression({
  event,
  nextValue,
  setSuppressOverlay,
}: {
  event: { active: DragStartEvent["active"] };
  nextValue: boolean;
  setSuppressOverlay: (nextValue: boolean) => void;
}) {
  const data = event.active.data?.current as { type?: string } | undefined;
  if (data?.type !== "item") {
    return;
  }
  setSuppressOverlay(nextValue);
}

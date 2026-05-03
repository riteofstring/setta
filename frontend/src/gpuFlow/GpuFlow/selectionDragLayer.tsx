import { useEffect, useState, type ReactNode, type RefObject } from "react";

import type { GpuFrameReason } from "../gpuRenderer";
import {
  attachGpuSelectionDragController,
  syncGpuSelectionBoundsFromLayoutStore,
  type GpuSelectionDragControllerOptions,
} from "../interactions/selectionDrag";
import type { GpuFlowLayoutStoreApi } from "../layoutStore";
import type { GpuFlowViewportStoreApi } from "../viewportStore";
import {
  getVisibleGpuNodesSelectionOverlaySnapshot,
  GpuNodesSelectionOverlay,
  type GpuNodesSelectionOverlaySnapshot,
} from "./selectionOverlay";

export type GpuFlowSelectionDragOptions =
  | false
  | Omit<
      GpuSelectionDragControllerOptions,
      "element" | "layoutStore" | "requestFrame" | "store"
    >
  | undefined;

export function useGpuFlowSelectionDragLayer({
  containerRef,
  layoutStore,
  requestFrame,
  selectionDrag,
  viewportStore,
}: {
  readonly containerRef: RefObject<HTMLDivElement | null>;
  readonly layoutStore: GpuFlowLayoutStoreApi | undefined;
  readonly requestFrame: (reason: GpuFrameReason) => void;
  readonly selectionDrag: GpuFlowSelectionDragOptions;
  readonly viewportStore: GpuFlowViewportStoreApi;
}): ReactNode {
  const [nodesSelectionOverlay, setNodesSelectionOverlay] =
    useState<GpuNodesSelectionOverlaySnapshot | null>(() =>
      getVisibleGpuNodesSelectionOverlaySnapshot(viewportStore.getState()),
    );
  const [nodesSelectionRectElement, setNodesSelectionRectElement] =
    useState<HTMLElement | null>(null);

  useEffect(() => {
    setNodesSelectionOverlay(
      getVisibleGpuNodesSelectionOverlaySnapshot(viewportStore.getState()),
    );
    return viewportStore.subscribe((state, previousState) => {
      if (
        state.nodesSelectionBounds !== previousState.nodesSelectionBounds ||
        state.transform !== previousState.transform
      ) {
        setNodesSelectionOverlay(
          getVisibleGpuNodesSelectionOverlaySnapshot(state),
        );
      }
    });
  }, [viewportStore]);

  useEffect(() => {
    if (!selectionDrag || !layoutStore) {
      return;
    }
    const selectedNodeIds = selectionDrag.selectedNodeIds ?? [];
    syncGpuSelectionBoundsFromLayoutStore({
      layoutStore,
      selectedNodeIds,
      store: viewportStore,
    });
    return layoutStore.subscribe((state, previousState) => {
      if (
        state.nodeOrder === previousState.nodeOrder &&
        state.nodesById === previousState.nodesById
      ) {
        return;
      }
      if (viewportStore.getState().userSelectionRect !== null) {
        return;
      }
      syncGpuSelectionBoundsFromLayoutStore({
        layoutStore,
        selectedNodeIds,
        store: viewportStore,
      });
    });
  }, [layoutStore, selectionDrag, viewportStore]);

  useEffect(() => {
    if (!selectionDrag) {
      return;
    }
    selectionDrag.onSelectionElementChange?.(nodesSelectionRectElement);
    return () => {
      selectionDrag.onSelectionElementChange?.(null);
    };
  }, [nodesSelectionRectElement, selectionDrag]);

  useEffect(() => {
    if (
      !selectionDrag ||
      !selectionDrag.primaryNodeId ||
      !nodesSelectionOverlay
    ) {
      return;
    }
    nodesSelectionRectElement?.focus({ preventScroll: true });
  }, [nodesSelectionRectElement, nodesSelectionOverlay, selectionDrag]);

  useEffect(() => {
    if (!selectionDrag) {
      return;
    }
    const container = containerRef.current;
    if (!container) {
      return;
    }
    if (!layoutStore) {
      throw new Error("GpuFlow selection drag requires a layout store.");
    }
    return attachGpuSelectionDragController({
      ...selectionDrag,
      element: container,
      layoutStore,
      requestFrame,
      store: viewportStore,
    });
  }, [containerRef, layoutStore, requestFrame, selectionDrag, viewportStore]);

  return (
    <GpuNodesSelectionOverlay
      onRectElementChange={setNodesSelectionRectElement}
      primaryNodeId={selectionDrag ? selectionDrag.primaryNodeId : null}
      snapshot={nodesSelectionOverlay}
    />
  );
}

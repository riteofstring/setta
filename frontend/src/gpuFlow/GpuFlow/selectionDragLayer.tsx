import { useEffect, useState, type RefObject } from "react";

import type { GpuFrameReason } from "../gpuRenderer";
import {
  attachGpuSelectionDragController,
  syncGpuSelectionBoundsFromLayoutStore,
  type GpuSelectionDragControllerOptions,
} from "../interactions/selectionDrag";
import type { GpuFlowLayoutStoreApi } from "../layoutStore";
import type { GpuFlowViewportStoreApi } from "../viewportStore";
import { getVisibleGpuNodesSelectionOverlaySnapshot } from "./selectionOverlay";

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
}): void {
  const [nodesSelectionVisible, setNodesSelectionVisible] = useState(() =>
    Boolean(
      getVisibleGpuNodesSelectionOverlaySnapshot(viewportStore.getState()),
    ),
  );

  useEffect(() => {
    setNodesSelectionVisible(
      Boolean(
        getVisibleGpuNodesSelectionOverlaySnapshot(viewportStore.getState()),
      ),
    );
    return viewportStore.subscribe((state, previousState) => {
      if (
        state.nodesSelectionBounds !== previousState.nodesSelectionBounds ||
        state.transform !== previousState.transform
      ) {
        setNodesSelectionVisible(
          Boolean(getVisibleGpuNodesSelectionOverlaySnapshot(state)),
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
    if (
      !selectionDrag ||
      !selectionDrag.primaryNodeId ||
      !nodesSelectionVisible
    ) {
      return;
    }
    containerRef.current?.focus({ preventScroll: true });
  }, [containerRef, nodesSelectionVisible, selectionDrag]);

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
}

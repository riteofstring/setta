import { useEffect, useState, type ReactNode } from "react";

import type {
  GpuFlowLayoutDropMarker,
  GpuFlowLayoutNode,
  GpuFlowLayoutStore,
  GpuFlowLayoutStoreApi,
} from "../layoutStore";
import type { GpuRect, GpuViewportTuple } from "../viewportMath";
import type { GpuFlowViewportStoreApi } from "../viewportStore";

type GpuNodeDragPreviewOverlaySnapshot = {
  readonly dropMarker: GpuFlowLayoutDropMarker | null;
  readonly draggingNodes: readonly GpuNodeDragPreviewNode[];
  readonly transform: GpuViewportTuple;
};

type GpuNodeDragPreviewNode = {
  readonly nodeId: string;
  readonly rect: GpuRect;
};

export function useGpuFlowNodeDragPreviewLayer({
  layoutStore,
  viewportStore,
}: {
  readonly layoutStore: GpuFlowLayoutStoreApi | undefined;
  readonly viewportStore: GpuFlowViewportStoreApi;
}): ReactNode {
  const [snapshot, setSnapshot] =
    useState<GpuNodeDragPreviewOverlaySnapshot | null>(() =>
      getVisibleGpuNodeDragPreviewOverlaySnapshot({
        layoutStore,
        viewportStore,
      }),
    );

  useEffect(() => {
    const syncSnapshot = () => {
      setSnapshot(
        getVisibleGpuNodeDragPreviewOverlaySnapshot({
          layoutStore,
          viewportStore,
        }),
      );
    };
    syncSnapshot();
    const unsubscribeLayout = layoutStore?.subscribe((state, previousState) => {
      if (
        state.dragPreview === previousState.dragPreview &&
        state.nodeOrder === previousState.nodeOrder &&
        state.nodesById === previousState.nodesById
      ) {
        return;
      }
      syncSnapshot();
    });
    const unsubscribeViewport = viewportStore.subscribe(
      (state, previousState) => {
        if (state.transform === previousState.transform) {
          return;
        }
        syncSnapshot();
      },
    );
    return () => {
      unsubscribeLayout?.();
      unsubscribeViewport();
    };
  }, [layoutStore, viewportStore]);

  return <GpuNodeDragPreviewOverlay snapshot={snapshot} />;
}

function GpuNodeDragPreviewOverlay({
  snapshot,
}: {
  readonly snapshot: GpuNodeDragPreviewOverlaySnapshot | null;
}) {
  if (!snapshot) {
    return null;
  }
  const { dropMarker, draggingNodes, transform } = snapshot;
  return (
    <div
      className="setta-gpu-flow__drag-preview-layer"
      data-gpu-flow-drag-preview-layer="true"
      style={{
        transform: `translate(${transform[0]}px, ${transform[1]}px) scale(${transform[2]})`,
      }}
    >
      {dropMarker ? <GpuNodeDropMarker marker={dropMarker} /> : null}
      {draggingNodes.map((node) => (
        <div
          className="setta-gpu-flow__drag-preview-node"
          data-gpu-flow-drag-preview-node={node.nodeId}
          key={node.nodeId}
          style={rectStyle(node.rect)}
        />
      ))}
    </div>
  );
}

function GpuNodeDropMarker({
  marker,
}: {
  readonly marker: GpuFlowLayoutDropMarker;
}) {
  return (
    <div
      className={`setta-gpu-flow__drop-marker setta-gpu-flow__drop-marker--${marker.axis}`}
      data-gpu-flow-drop-marker="true"
      data-gpu-flow-drop-marker-axis={marker.axis}
      data-gpu-flow-drop-marker-child={marker.childNodeId}
      data-gpu-flow-drop-marker-index={marker.index}
      data-gpu-flow-drop-marker-parent={marker.parentNodeId}
      style={rectStyle(marker.rect)}
    />
  );
}

function getVisibleGpuNodeDragPreviewOverlaySnapshot({
  layoutStore,
  viewportStore,
}: {
  readonly layoutStore: GpuFlowLayoutStoreApi | undefined;
  readonly viewportStore: GpuFlowViewportStoreApi;
}): GpuNodeDragPreviewOverlaySnapshot | null {
  if (!layoutStore) {
    return null;
  }
  const layoutState = layoutStore.getState();
  const draggingNodes = getGpuNodeDragPreviewNodes(layoutState);
  const dropMarker = layoutState.dragPreview?.dropMarker ?? null;
  if (!dropMarker && draggingNodes.length === 0) {
    return null;
  }
  return {
    draggingNodes,
    dropMarker,
    transform: viewportStore.getState().transform,
  };
}

function getGpuNodeDragPreviewNodes(
  layoutState: GpuFlowLayoutStore,
): readonly GpuNodeDragPreviewNode[] {
  return layoutState
    .getNodes()
    .filter(isDraggingMeasuredGpuFlowLayoutNode)
    .map((node) => ({
      nodeId: node.nodeId,
      rect: {
        height: node.height,
        width: node.width,
        x: node.x,
        y: node.y,
      },
    }));
}

function isDraggingMeasuredGpuFlowLayoutNode(
  node: GpuFlowLayoutNode,
): node is GpuFlowLayoutNode & {
  readonly height: number;
  readonly width: number;
} {
  return (
    node.interactionFlags?.dragging === true &&
    typeof node.height === "number" &&
    typeof node.width === "number" &&
    node.height > 0 &&
    node.width > 0
  );
}

function rectStyle(rect: GpuRect) {
  return {
    height: rect.height,
    left: rect.x,
    top: rect.y,
    width: rect.width,
  };
}

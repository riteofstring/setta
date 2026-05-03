import type {
  GpuEdgeReconnectAnchor,
  GpuEdgeScene,
} from "../edges/edgeSources";
import {
  GpuEdgeReconnectAnchorLayer,
  type GpuEdgeReconnectOptions,
} from "../GpuEdgeReconnectAnchors";
import type { GpuFlowLayoutStoreApi } from "../layoutStore";
import type { GpuFlowViewportStoreApi } from "../viewportStore";

const EMPTY_EDGE_RECONNECT_ANCHORS: readonly GpuEdgeReconnectAnchor[] = [];

export function renderGpuFlowEdgeReconnectElement({
  edgeReconnect,
  edgeScene,
  layoutStore,
  viewportStore,
}: {
  readonly edgeReconnect: false | GpuEdgeReconnectOptions | undefined;
  readonly edgeScene: GpuEdgeScene | undefined;
  readonly layoutStore: GpuFlowLayoutStoreApi | undefined;
  readonly viewportStore: GpuFlowViewportStoreApi;
}) {
  if (!edgeReconnect) {
    return null;
  }
  return (
    <GpuEdgeReconnectAnchorLayer
      anchors={edgeScene?.reconnectAnchors ?? EMPTY_EDGE_RECONNECT_ANCHORS}
      layoutStore={layoutStore}
      options={edgeReconnect}
      viewportStore={viewportStore}
    />
  );
}

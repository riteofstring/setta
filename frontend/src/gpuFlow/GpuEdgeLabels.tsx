import { useRef, type CSSProperties } from "react";
import type { GpuEdgeSceneLabel } from "./edges/edgeSources";
import {
  getGpuEdgeViewportLayerStyle,
  useGpuEdgeViewportLayerSync,
} from "./GpuEdgeViewportLayer";
import type { GpuViewportInput } from "./viewportMath";
import {
  gpuFlowViewportStore,
  type GpuFlowViewportStoreApi,
} from "./viewportStore";

export function GpuEdgeLabelLayer({
  labels,
  viewportStore = gpuFlowViewportStore,
}: {
  readonly labels: readonly GpuEdgeSceneLabel[];
  readonly viewportStore?: GpuFlowViewportStoreApi | undefined;
}) {
  if (labels.length === 0) {
    return null;
  }
  return (
    <GpuEdgeLabelViewportLayer labels={labels} viewportStore={viewportStore} />
  );
}

function GpuEdgeLabelViewportLayer({
  labels,
  viewportStore,
}: {
  readonly labels: readonly GpuEdgeSceneLabel[];
  readonly viewportStore: GpuFlowViewportStoreApi;
}) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  useGpuEdgeViewportLayerSync({ layerRef, viewportStore });
  const layerStyle = getGpuEdgeLabelLayerStyle(
    viewportStore.getState().transform,
  );
  return (
    <div
      className="setta-gpu-flow__edge-label-layer"
      data-gpu-flow-edge-label-layer="true"
      ref={layerRef}
      style={layerStyle}
    >
      {labels.map((label) => (
        <div
          className={`setta-gpu-flow__edge-label setta-gpu-flow__edge-label--${label.kind}`}
          data-edgeid={label.edgeId}
          data-testid={`gpu-edge-label-${label.id}`}
          key={label.id}
          style={getGpuEdgeLabelStyle(label)}
        >
          {label.text}
        </div>
      ))}
    </div>
  );
}

export function getGpuEdgeLabelLayerStyle(
  viewport: GpuViewportInput,
): CSSProperties {
  return getGpuEdgeViewportLayerStyle(viewport);
}

export function getGpuEdgeLabelStyle(label: GpuEdgeSceneLabel): CSSProperties {
  return {
    height: label.height,
    transform: `translate(${label.x - label.width / 2}px, ${label.y - label.height / 2}px)`,
    width: label.width,
    zIndex: label.zIndex,
  };
}

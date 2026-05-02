import type { CSSProperties } from "react";
import type { GpuEdgeSceneLabel } from "./edges/edgeSources";
import { normalizeGpuViewport, type GpuViewportInput } from "./viewportMath";

export function GpuEdgeLabelLayer({
  labels,
  viewport,
}: {
  readonly labels: readonly GpuEdgeSceneLabel[];
  readonly viewport: GpuViewportInput;
}) {
  if (labels.length === 0) {
    return null;
  }
  const layerStyle = getGpuEdgeLabelLayerStyle(viewport);
  return (
    <div
      className="setta-gpu-flow__edge-label-layer"
      data-gpu-flow-edge-label-layer="true"
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
  const normalized = normalizeGpuViewport(viewport);
  return {
    transform: `translate(${normalized.x}px, ${normalized.y}px) scale(${normalized.zoom})`,
  };
}

export function getGpuEdgeLabelStyle(
  label: GpuEdgeSceneLabel,
): CSSProperties {
  return {
    height: label.height,
    transform: `translate(${label.x - label.width / 2}px, ${label.y - label.height / 2}px)`,
    width: label.width,
    zIndex: label.zIndex,
  };
}

import { NO_PAN_CLASS_NAME } from "utils/constants";
import { GPU_FLOW_CLASS_NAMES } from "../gpuFlowDomClasses";
import type { GpuRect, GpuViewportTuple } from "../viewportMath";
import type {
  GpuFlowViewportStoreApi,
  GpuUserSelectionRect,
} from "../viewportStore";

export type GpuNodesSelectionOverlaySnapshot = {
  readonly bounds: GpuRect;
  readonly transform: GpuViewportTuple;
};

export function GpuUserSelectionOverlay({
  rect,
}: {
  readonly rect: GpuUserSelectionRect | null;
}) {
  if (!rect) {
    return null;
  }
  return (
    <div
      className="setta-gpu-flow__selection-layer"
      data-gpu-flow-selection-layer="true"
    >
      <div
        className="setta-gpu-flow__selection"
        data-gpu-flow-selection="true"
        style={{
          height: rect.height,
          transform: `translate(${rect.x}px, ${rect.y}px)`,
          width: rect.width,
        }}
      />
    </div>
  );
}

export function GpuNodesSelectionOverlay({
  onRectElementChange,
  primaryNodeId,
  snapshot,
}: {
  readonly onRectElementChange?:
    | ((element: HTMLElement | null) => void)
    | undefined;
  readonly primaryNodeId?: string | null | undefined;
  readonly snapshot: GpuNodesSelectionOverlaySnapshot | null;
}) {
  if (!snapshot || !primaryNodeId) {
    return null;
  }
  const { bounds, transform } = snapshot;
  return (
    <div
      className={`${GPU_FLOW_CLASS_NAMES.nodesSelection} ${GPU_FLOW_CLASS_NAMES.container} ${NO_PAN_CLASS_NAME}`}
      style={{
        transform: `translate(${transform[0]}px,${transform[1]}px) scale(${transform[2]})`,
      }}
    >
      <div
        className={GPU_FLOW_CLASS_NAMES.nodesSelectionRect}
        data-id={primaryNodeId}
        data-gpu-flow-nodes-selection-rect="true"
        ref={onRectElementChange}
        style={{
          height: bounds.height,
          left: bounds.x,
          top: bounds.y,
          width: bounds.width,
        }}
        tabIndex={-1}
      />
    </div>
  );
}

export function getVisibleGpuUserSelectionRect(
  state: ReturnType<GpuFlowViewportStoreApi["getState"]>,
): GpuUserSelectionRect | null {
  return state.userSelectionActive ? state.userSelectionRect : null;
}

export function getVisibleGpuNodesSelectionOverlaySnapshot(
  state: ReturnType<GpuFlowViewportStoreApi["getState"]>,
): GpuNodesSelectionOverlaySnapshot | null {
  return state.nodesSelectionBounds
    ? {
        bounds: state.nodesSelectionBounds,
        transform: state.transform,
      }
    : null;
}

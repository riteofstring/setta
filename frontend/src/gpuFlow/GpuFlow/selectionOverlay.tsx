import type {
  GpuFlowViewportStoreApi,
  GpuUserSelectionRect,
} from "../viewportStore";

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

export function getVisibleGpuUserSelectionRect(
  state: ReturnType<GpuFlowViewportStoreApi["getState"]>,
): GpuUserSelectionRect | null {
  return state.userSelectionActive ? state.userSelectionRect : null;
}

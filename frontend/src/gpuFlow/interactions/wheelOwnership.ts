import type { GpuFlowViewportStoreApi } from "../viewportStore";

export function isGpuViewportWheelGestureActive(
  store: GpuFlowViewportStoreApi,
): boolean {
  const state = store.getState();
  return (
    state.panScrolling ||
    state.pointerPanning ||
    state.paneDragging ||
    state.wheelZooming
  );
}

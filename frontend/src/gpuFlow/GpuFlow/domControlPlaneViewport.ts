import type { GpuViewportTuple } from "../viewportMath";
import type { GpuFlowViewportRuntime } from "../viewportRuntime";
import type { GpuFlowViewportStoreApi } from "../viewportStore";

export type GpuFlowDomControlPlaneViewportSize = {
  readonly height: number;
  readonly width: number;
};

export function getLiveGpuFlowDomControlPlaneViewport({
  viewportRuntime,
  viewportStore,
}: {
  readonly viewportRuntime: GpuFlowViewportRuntime;
  readonly viewportStore: GpuFlowViewportStoreApi;
}): GpuViewportTuple {
  const runtimeViewport = viewportRuntime.getViewportTuple();
  const viewportState = viewportStore.getState();
  if (
    viewportState.viewportInteractionActive ||
    areGpuFlowDomControlPlaneViewportTuplesEqual(
      runtimeViewport,
      viewportState.transform,
    )
  ) {
    return runtimeViewport;
  }
  return viewportState.transform;
}

export function getGpuFlowDomControlPlaneViewportSize({
  viewportStore,
}: {
  readonly viewportStore: GpuFlowViewportStoreApi;
}): GpuFlowDomControlPlaneViewportSize {
  const state = viewportStore.getState();
  return {
    height: state.height,
    width: state.width,
  };
}

export function getGpuFlowDomControlPlaneViewportCanvasSize(
  viewportSize: GpuFlowDomControlPlaneViewportSize | undefined,
): GpuFlowDomControlPlaneViewportSize {
  if (viewportSize && viewportSize.width > 0 && viewportSize.height > 0) {
    return viewportSize;
  }
  if (typeof window === "undefined") {
    return { height: 0, width: 0 };
  }
  return { height: window.innerHeight, width: window.innerWidth };
}

function areGpuFlowDomControlPlaneViewportTuplesEqual(
  left: GpuViewportTuple,
  right: GpuViewportTuple,
): boolean {
  return left[0] === right[0] && left[1] === right[1] && left[2] === right[2];
}

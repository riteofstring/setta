import {
  getGpuRetainedContentRuntimeScrollOffsets,
  getGpuRetainedContentRuntimeScrollRevision,
  getGpuRetainedContentRuntimeScrollRevisions,
  type GpuRetainedContentRuntimeState,
} from "../retainedContentRuntimeState";
import {
  createGpuRetainedRuntimeFrame,
  type GpuRetainedRuntimeFrame,
} from "../retainedRuntimeFrame";
import type { GpuFlowViewportRuntime } from "../viewportRuntime";
import type { GpuFlowViewportStoreApi } from "../viewportStore";
import type { GpuFlowProps } from "./flowSurfaceTypes";

export function createInitialGpuFlowRetainedRuntimeFrame({
  retainedContentRuntimeState,
  scene,
  viewport,
  viewportRuntime,
  viewportStore,
}: {
  readonly retainedContentRuntimeState: GpuRetainedContentRuntimeState;
  readonly scene: GpuFlowProps["scene"];
  readonly viewport: GpuFlowProps["viewport"];
  readonly viewportRuntime: GpuFlowViewportRuntime;
  readonly viewportStore: GpuFlowViewportStoreApi;
}): GpuRetainedRuntimeFrame {
  return createGpuRetainedRuntimeFrame({
    devicePixelRatioBucket:
      typeof window === "undefined" ? 1 : window.devicePixelRatio,
    frameId: 0,
    scene,
    scrollOffsets: getGpuRetainedContentRuntimeScrollOffsets(
      retainedContentRuntimeState,
    ),
    scrollRevision: getGpuRetainedContentRuntimeScrollRevision(
      retainedContentRuntimeState,
    ),
    scrollRevisions: getGpuRetainedContentRuntimeScrollRevisions(
      retainedContentRuntimeState,
    ),
    viewport: viewport ?? viewportRuntime.getViewportTuple(),
    viewportSize: getInitialGpuFlowViewportSize(viewportStore),
    viewportZoomBucket: 1,
  });
}

function getInitialGpuFlowViewportSize(
  viewportStore: GpuFlowViewportStoreApi,
): { readonly height: number; readonly width: number } | undefined {
  const { height, width } = viewportStore.getState();
  if (height <= 0 || width <= 0) {
    return undefined;
  }
  return { height, width };
}

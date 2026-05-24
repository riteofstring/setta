import type { GpuCanvasSize } from "../gpuRenderer";
import type { GpuFlowLiveProjectionSample } from "../projectionRuntime";
import type { GpuRetainedContentScrollOffsetMap } from "../retainedContentScroll";
import {
  createGpuRetainedRuntimeFrame,
  type GpuRetainedRuntimeFrame,
} from "../retainedRuntimeFrame";

import type { GpuFlowNodeLayerState } from "./flowLayerState";

export function createGpuFlowRetainedRuntimeFrameForLayer({
  canvasSize,
  devicePixelRatio,
  frame,
  layer,
  renderedSceneNodeIds,
  scrollOffsets,
  scrollRevision,
  scrollRevisions,
  viewport,
  viewportZoomBucket,
}: {
  readonly canvasSize: GpuCanvasSize;
  readonly devicePixelRatio: number;
  readonly frame: number;
  readonly layer: GpuFlowNodeLayerState;
  readonly renderedSceneNodeIds: readonly string[];
  readonly scrollOffsets: GpuRetainedContentScrollOffsetMap;
  readonly scrollRevision: number;
  readonly scrollRevisions: ReadonlyMap<string, number>;
  readonly viewport: GpuFlowLiveProjectionSample["viewport"];
  readonly viewportZoomBucket: number;
}): GpuRetainedRuntimeFrame {
  return createGpuRetainedRuntimeFrame({
    devicePixelRatioBucket: devicePixelRatio,
    frameId: frame,
    rowHoverTarget: layer.retainedContentRowHoverTarget ?? null,
    renderedSceneNodeIds,
    scene: layer.scene,
    scrollbarVisualState: layer.retainedContentScrollbarVisualState,
    scrollOffsets,
    scrollRevision,
    scrollRevisions,
    viewport,
    viewportSize: {
      height: canvasSize.cssHeight,
      width: canvasSize.cssWidth,
    },
    viewportZoomBucket,
  });
}

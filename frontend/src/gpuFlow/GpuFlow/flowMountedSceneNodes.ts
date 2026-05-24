import type { GpuNodeLayout } from "../htmlSurfaces/frame";

import { createGpuFlowRetainedContentNativeVisualSignature } from "./flowFrameVisuals";
import type { GpuFlowNodeLayerState } from "./flowLayerState";

export function createGpuFlowRenderedSceneNodeIds({
  layer,
  nodeElementById,
}: {
  readonly layer: GpuFlowNodeLayerState;
  readonly nodeElementById: ReadonlyMap<string, HTMLElement>;
}): readonly string[] {
  return (layer.nodes ?? [])
    .map((node: GpuNodeLayout) => node.nodeId)
    .filter((nodeId) => nodeElementById.has(nodeId));
}

export function createGpuFlowRetainedRuntimeFrameSourceSignature({
  layer,
  nodeElementById,
}: {
  readonly layer: GpuFlowNodeLayerState;
  readonly nodeElementById: ReadonlyMap<string, HTMLElement>;
}): string {
  return JSON.stringify({
    mountedSceneNodeIds: createGpuFlowRenderedSceneNodeIds({
      layer,
      nodeElementById,
    }),
    nativeVisuals: createGpuFlowRetainedContentNativeVisualSignature(layer),
  });
}

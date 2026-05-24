import type { MutableRefObject } from "react";

import {
  getGpuRetainedContentRuntimeScrollOffsets,
  syncGpuRetainedContentRuntimeStateForScene,
  type GpuRetainedContentRuntimeState,
} from "../retainedContentRuntimeState";
import type { GpuFlowScene } from "../scene";
import {
  mergeGpuFlowRetainedContentSurfaceLayouts,
  type GpuFlowRetainedContentNodeLayerState,
} from "./retainedContentControllerSurfaceUpdates";

export function sampleGpuFlowRetainedContentRuntimeScene<
  TLayerState extends GpuFlowRetainedContentNodeLayerState,
>({
  getNativeVisuals = getDefaultGpuFlowRetainedContentNativeVisuals,
  nodeLayerRef,
  retainedContentRuntimeState,
}: {
  readonly getNativeVisuals?:
    | ((
        scene: GpuFlowScene | undefined,
        layerState: TLayerState,
      ) => GpuFlowRetainedContentNodeLayerState["htmlSurfaceNativeVisuals"])
    | undefined;
  readonly nodeLayerRef: MutableRefObject<TLayerState>;
  readonly retainedContentRuntimeState: GpuRetainedContentRuntimeState;
}): {
  readonly changed: boolean;
  readonly scene: GpuFlowScene | undefined;
} {
  const previousScene = nodeLayerRef.current.scene;
  const changed = syncGpuRetainedContentRuntimeStateForScene({
    scene: previousScene,
    state: retainedContentRuntimeState,
  });
  const scrollOffsets = getGpuRetainedContentRuntimeScrollOffsets(
    retainedContentRuntimeState,
  );
  const nextScene = previousScene;
  if (!changed) {
    return { changed: false, scene: nextScene };
  }
  const nextLayerState = {
    ...nodeLayerRef.current,
    edgeLabelSurfaces: nextScene
      ? mergeGpuFlowRetainedContentSurfaceLayouts({
          overlays: nodeLayerRef.current.edgeLabelSurfaces,
          scene: nextScene,
        })
      : nodeLayerRef.current.edgeLabelSurfaces,
    retainedContentRuntimeScrollOffsets: scrollOffsets,
    scene: nextScene,
  };
  nodeLayerRef.current = {
    ...nextLayerState,
    htmlSurfaceNativeVisuals: getNativeVisuals(nextScene, nextLayerState),
  };
  return { changed: true, scene: nextScene };
}

function getDefaultGpuFlowRetainedContentNativeVisuals(
  scene: GpuFlowScene | undefined,
  layerState: GpuFlowRetainedContentNodeLayerState,
): GpuFlowRetainedContentNodeLayerState["htmlSurfaceNativeVisuals"] {
  void scene;
  return (
    layerState.retainedRuntimeFrame?.descriptors.htmlSurfaceNativeVisuals ??
    layerState.htmlSurfaceNativeVisuals
  );
}

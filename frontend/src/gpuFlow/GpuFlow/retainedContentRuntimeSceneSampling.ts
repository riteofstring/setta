import type { MutableRefObject } from "react";

import { getGpuRetainedContentScrollbarVisuals } from "../GpuRetainedContentScrollbarVisuals";
import {
  getGpuRetainedContentRowHoverStateVisuals,
  getGpuRetainedContentRowHoverVisuals,
} from "../retainedContentRowHover";
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
  const rowHoverTarget = layerState.retainedContentRowHoverTarget ?? null;
  const scrollOffsets =
    layerState.retainedContentRuntimeScrollOffsets ?? new Map();
  return scene
    ? [
        ...getGpuRetainedContentScrollbarVisuals(scene.contentSurfaces, {
          scrollOffsets,
          visualState: layerState.retainedContentScrollbarVisualState,
        }),
        ...(rowHoverTarget
          ? getGpuRetainedContentRowHoverVisuals({
              scene,
              scrollOffsets,
              target: rowHoverTarget,
            })
          : getGpuRetainedContentRowHoverStateVisuals({
              scene,
              scrollOffsets,
            })),
      ]
    : undefined;
}

import type { MutableRefObject } from "react";

import { getGpuRetainedContentScrollbarVisuals } from "../GpuRetainedContentScrollbarVisuals";
import {
  applyGpuRetainedContentRuntimeStateToScene,
  type GpuRetainedContentRuntimeState,
} from "../retainedContentRuntimeState";
import {
  applyGpuRetainedContentRowHoverTargetToScene,
  getGpuRetainedContentRowHoverStateVisuals,
  getGpuRetainedContentRowHoverVisuals,
} from "../retainedContentRowHover";
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
  const runtimeScene = applyGpuRetainedContentRuntimeStateToScene({
    scene: previousScene,
    state: retainedContentRuntimeState,
  });
  const hoverTarget = nodeLayerRef.current.retainedContentRowHoverTarget ?? null;
  const hoverUpdate = runtimeScene
    ? applyGpuRetainedContentRowHoverTargetToScene({
        scene: runtimeScene,
        target: hoverTarget,
      })
    : null;
  const nextScene = hoverUpdate?.scene ?? runtimeScene;
  if (nextScene === previousScene) {
    return { changed: false, scene: nextScene };
  }
  nodeLayerRef.current = {
    ...nodeLayerRef.current,
    edgeLabelSurfaces: nextScene
      ? mergeGpuFlowRetainedContentSurfaceLayouts({
          overlays: nodeLayerRef.current.edgeLabelSurfaces,
          scene: nextScene,
        })
      : nodeLayerRef.current.edgeLabelSurfaces,
    htmlSurfaceNativeVisuals: getNativeVisuals(nextScene, nodeLayerRef.current),
    scene: nextScene,
  };
  return { changed: true, scene: nextScene };
}

function getDefaultGpuFlowRetainedContentNativeVisuals(
  scene: GpuFlowScene | undefined,
  layerState: GpuFlowRetainedContentNodeLayerState,
): GpuFlowRetainedContentNodeLayerState["htmlSurfaceNativeVisuals"] {
  const rowHoverTarget = layerState.retainedContentRowHoverTarget ?? null;
  return scene
    ? [
        ...getGpuRetainedContentScrollbarVisuals(scene.contentSurfaces),
        ...(rowHoverTarget
          ? getGpuRetainedContentRowHoverVisuals({
              scene,
              target: rowHoverTarget,
            })
          : getGpuRetainedContentRowHoverStateVisuals({ scene })),
      ]
    : undefined;
}

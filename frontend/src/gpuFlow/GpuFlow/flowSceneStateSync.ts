import type { MutableRefObject } from "react";

import type { GpuEdgeBufferInput } from "../edges/edgeGpuBuffers";
import type { GpuEdgeScene } from "../edges/edgeSources";
import type { GpuEdgePaletteInput, GpuGridInput } from "../gpuPipelines";
import type { GpuSurfaceHandle } from "../GpuSurface";
import {
  clearGpuNodeDomTransformSyncCache,
  type GpuHtmlSurfaceOverlayLayout,
  type GpuNodeDomTransformSyncCache,
  type GpuNodeLayout,
  type GpuNodeUploadBudget,
} from "../htmlSurfaces/frame";
import type { HtmlSurfaceInteractionProjector } from "../htmlSurfaces/interactionProjector";
import type { HtmlSurfaceRenderer } from "../htmlSurfaces/renderer";
import type { HtmlSurfaceTextureManager } from "../htmlSurfaces/textures";
import type { HtmlSurfaceSolidRoundedRectVisual } from "../htmlSurfaces/visualScene";
import {
  getGpuRetainedContentRuntimeScrollOffsets,
  syncGpuRetainedContentRuntimeStateForScene,
  type GpuRetainedContentRuntimeState,
} from "../retainedContentRuntimeState";
import type { RetainedContentTexturePageManager } from "../retainedContentTexturePageManager";
import type { GpuFlowScene } from "../scene";
import {
  resolveGpuFlowEdgeDrawInputs,
  validateGpuFlowEdgeInput,
} from "./edgeInput";
import { destroyNodeLayerResources } from "./flowFrame";
import type { GpuFlowNodeLayerState } from "./flowLayerState";

export function syncGpuFlowNodeLayerSceneState({
  activeRetainedContentRuntimeState,
  edgeInteraction,
  edgePalette,
  edgeReconnect,
  edgeScene,
  edges,
  forceVisibleNodeIds,
  grid,
  htmlSurfaceNativeVisuals,
  htmlSurfaceOverlays,
  htmlSurfaceRendererRef,
  marginCssPx,
  nodeDomTransformSyncCacheRef,
  nodeLayerRef,
  nodes,
  nodeTextureMemoryBudgetBytes,
  retainedContentPageManagerRef,
  retainedDomControlElementByIdRef,
  scene,
  sourceInteractionProjector,
  surfaceRef,
  textureManagerRef,
  transformOnlyPaintNodeIdsRef,
  uploadBudget,
  viewport,
  visibleNodeIdsRef,
}: {
  readonly activeRetainedContentRuntimeState: GpuRetainedContentRuntimeState;
  readonly edgeInteraction: unknown;
  readonly edgePalette: GpuEdgePaletteInput | undefined;
  readonly edgeReconnect: unknown;
  readonly edgeScene: GpuEdgeScene | undefined;
  readonly edges: readonly GpuEdgeBufferInput[] | undefined;
  readonly forceVisibleNodeIds:
    | ReadonlySet<string>
    | readonly string[]
    | undefined;
  readonly grid: GpuGridInput | undefined;
  readonly htmlSurfaceNativeVisuals:
    | readonly HtmlSurfaceSolidRoundedRectVisual[]
    | undefined;
  readonly htmlSurfaceOverlays:
    | readonly GpuHtmlSurfaceOverlayLayout[]
    | undefined;
  readonly htmlSurfaceRendererRef: MutableRefObject<HtmlSurfaceRenderer | null>;
  readonly marginCssPx: number | undefined;
  readonly nodeDomTransformSyncCacheRef: MutableRefObject<GpuNodeDomTransformSyncCache>;
  readonly nodeLayerRef: MutableRefObject<GpuFlowNodeLayerState>;
  readonly nodes: readonly GpuNodeLayout[] | undefined;
  readonly nodeTextureMemoryBudgetBytes: number | undefined;
  readonly retainedContentPageManagerRef: MutableRefObject<RetainedContentTexturePageManager | null>;
  readonly retainedDomControlElementByIdRef: MutableRefObject<
    Map<string, HTMLElement>
  >;
  readonly scene: GpuFlowScene | undefined;
  readonly sourceInteractionProjector: HtmlSurfaceInteractionProjector;
  readonly surfaceRef: MutableRefObject<GpuSurfaceHandle | null>;
  readonly textureManagerRef: MutableRefObject<HtmlSurfaceTextureManager | null>;
  readonly transformOnlyPaintNodeIdsRef: MutableRefObject<Set<string>>;
  readonly uploadBudget: GpuNodeUploadBudget | undefined;
  readonly viewport: GpuFlowNodeLayerState["viewport"];
  readonly visibleNodeIdsRef: MutableRefObject<ReadonlySet<string>>;
}) {
  validateGpuFlowEdgeInput({
    edgeInteraction,
    edgeReconnect,
    edgeScene,
    edges,
  });
  const nextEdges = resolveGpuFlowEdgeDrawInputs({ edgeScene, edges });
  const retainedContentRowHoverTarget =
    nodeLayerRef.current.retainedContentRowHoverTarget ?? null;
  syncGpuRetainedContentRuntimeStateForScene({
    scene,
    state: activeRetainedContentRuntimeState,
  });
  const scrollOffsets = getGpuRetainedContentRuntimeScrollOffsets(
    activeRetainedContentRuntimeState,
  );
  const nextScene = scene;
  const previousRetainedRuntimeFrame =
    nodeLayerRef.current.retainedRuntimeFrame ?? null;
  const retainedRuntimeFrame =
    previousRetainedRuntimeFrame?.input.sceneRevision ===
    (nextScene?.revision ?? 0)
      ? previousRetainedRuntimeFrame
      : null;
  const nextHtmlSurfaceNativeVisuals = htmlSurfaceNativeVisuals;
  nodeLayerRef.current = {
    edgeScene,
    edgePalette,
    edges: nextEdges,
    edgeLabelSurfaces: htmlSurfaceOverlays,
    htmlSurfaceNativeVisuals: nextHtmlSurfaceNativeVisuals,
    forceVisibleNodeIds,
    grid,
    marginCssPx,
    nodes,
    nodeTextureMemoryBudgetBytes,
    retainedContentRuntimeScrollOffsets: scrollOffsets,
    retainedContentRowHoverTarget,
    retainedRuntimeFrame,
    scene: nextScene,
    uploadBudget,
    viewport,
  };
  if (
    isGpuFlowNodeLayerEmpty({
      grid,
      htmlSurfaceOverlays,
      nextEdges,
      nextHtmlSurfaceNativeVisuals,
      nextScene,
      nodes,
    })
  ) {
    visibleNodeIdsRef.current = new Set();
    retainedDomControlElementByIdRef.current.clear();
    clearGpuNodeDomTransformSyncCache(nodeDomTransformSyncCacheRef.current);
    transformOnlyPaintNodeIdsRef.current.clear();
    sourceInteractionProjector.destroy();
    destroyNodeLayerResources(
      textureManagerRef,
      htmlSurfaceRendererRef,
      retainedContentPageManagerRef,
    );
  }
  surfaceRef.current?.requestFrame("viewport");
}

function isGpuFlowNodeLayerEmpty({
  grid,
  htmlSurfaceOverlays,
  nextEdges,
  nextHtmlSurfaceNativeVisuals,
  nextScene,
  nodes,
}: {
  readonly grid: GpuGridInput | undefined;
  readonly htmlSurfaceOverlays:
    | readonly GpuHtmlSurfaceOverlayLayout[]
    | undefined;
  readonly nextEdges: readonly GpuEdgeBufferInput[] | undefined;
  readonly nextHtmlSurfaceNativeVisuals:
    | readonly HtmlSurfaceSolidRoundedRectVisual[]
    | undefined;
  readonly nextScene: GpuFlowScene | undefined;
  readonly nodes: readonly GpuNodeLayout[] | undefined;
}): boolean {
  return (
    !nodes &&
    !nextEdges &&
    !grid &&
    !htmlSurfaceOverlays?.length &&
    !nextHtmlSurfaceNativeVisuals?.length &&
    !nextScene?.contentSurfaces.length
  );
}

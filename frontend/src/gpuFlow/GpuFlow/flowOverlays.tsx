import { useMemo, type MutableRefObject, type ReactNode } from "react";

import type { GpuFlowCommittedSurfaceRuntime } from "../committedSurfaceRuntime";
import type { GpuEdgeScene } from "../edges/edgeSources";
import type { GpuSurfaceHandle } from "../GpuSurface";
import type {
  GpuHtmlSurfaceOverlayLayout,
  GpuNodeDomTransformSyncCache,
} from "../htmlSurfaces/frame";
import type { HtmlSurfaceTextureManager } from "../htmlSurfaces/textures";
import type { HtmlSurfaceSolidRoundedRectVisual } from "../htmlSurfaces/visualScene";
import type { GpuFlowLayoutNode, GpuFlowLayoutStoreApi } from "../layoutStore";
import type { GpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";
import type { GpuFlowViewportStoreApi } from "../viewportStore";
import { useGpuFlowEdgeLabelSources } from "./edgeLabelSources";
import type { GpuFlowProps } from "./flowSurfaceTypes";
import { useGpuFlowNodeDragPreviewSources } from "./nodeDragPreviewOverlay";
import { useGpuFlowNodeResizeOverlaySources } from "./nodeResizeOverlay";
import { useGpuFlowRetainedContentSources } from "./retainedContentSources";
import { useGpuFlowRetainedDomControlSnapshotSources } from "./retainedDomControlSnapshotSources";
import { useGpuFlowSelectionOverlaySources } from "./selectionOverlay";

type GpuFlowOverlaySources = {
  readonly edgeLabelSourceElement: ReactNode;
  readonly htmlSurfaceNativeVisuals: readonly HtmlSurfaceSolidRoundedRectVisual[];
  readonly htmlSurfaceOverlays: readonly GpuHtmlSurfaceOverlayLayout[];
  readonly nodeDragPreviewSourceElement: ReactNode;
  readonly nodeResizeOverlaySourceElement: ReactNode;
  readonly retainedDomControlSnapshotSourceElement: ReactNode;
  readonly selectionOverlaySourceElement: ReactNode;
};

export function useGpuFlowOverlaySources({
  committedSurfaceRuntime,
  edgeScene,
  layoutStore,
  nodeDomTransformSyncCacheRef,
  nodeElementByIdRef,
  nodes,
  primaryNodeId,
  renderRetainedDomControl,
  retainedRuntimeFrame,
  surfaceRef,
  textureManagerRef,
  transformOnlyPaintNodeIdsRef,
  viewportStore,
}: {
  readonly committedSurfaceRuntime?: GpuFlowCommittedSurfaceRuntime | undefined;
  readonly edgeScene: GpuEdgeScene | undefined;
  readonly layoutStore: GpuFlowLayoutStoreApi | undefined;
  readonly nodeDomTransformSyncCacheRef: MutableRefObject<GpuNodeDomTransformSyncCache>;
  readonly nodeElementByIdRef: MutableRefObject<Map<string, HTMLElement>>;
  readonly nodes: readonly GpuFlowLayoutNode[] | undefined;
  readonly primaryNodeId: string | null;
  readonly renderRetainedDomControl: GpuFlowProps["renderRetainedDomControl"];
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame | null | undefined;
  readonly surfaceRef: MutableRefObject<GpuSurfaceHandle | null>;
  readonly textureManagerRef: MutableRefObject<HtmlSurfaceTextureManager | null>;
  readonly transformOnlyPaintNodeIdsRef: MutableRefObject<Set<string>>;
  readonly viewportStore: GpuFlowViewportStoreApi;
}): GpuFlowOverlaySources {
  const { edgeLabelSourceElement, edgeLabelSurfaces } =
    useGpuFlowEdgeLabelSources({
      edgeScene,
      nodeDomTransformSyncCacheRef,
      nodeElementByIdRef,
      surfaceRef,
      textureManagerRef,
      transformOnlyPaintNodeIdsRef,
    });
  const { retainedContentNativeVisuals } = useGpuFlowRetainedContentSources({
    retainedRuntimeFrame,
  });
  const {
    retainedDomControlSnapshotSourceElement,
    retainedDomControlSnapshotSurfaces,
  } = useGpuFlowRetainedDomControlSnapshotSources({
    committedSurfaceRuntime,
    nodeDomTransformSyncCacheRef,
    nodeElementByIdRef,
    renderControl: renderRetainedDomControl,
    retainedRuntimeFrame,
    surfaceRef,
    textureManagerRef,
    transformOnlyPaintNodeIdsRef,
  });
  const { nodeDragPreviewSourceElement, nodeDragPreviewSurfaces } =
    useGpuFlowNodeDragPreviewSources({
      layoutStore,
      nodeDomTransformSyncCacheRef,
      nodeElementByIdRef,
      surfaceRef,
      textureManagerRef,
      transformOnlyPaintNodeIdsRef,
    });
  const { nodeResizeOverlaySourceElement, nodeResizeOverlaySurfaces } =
    useGpuFlowNodeResizeOverlaySources({
      nodeDomTransformSyncCacheRef,
      nodeElementByIdRef,
      nodes,
      primaryNodeId,
      surfaceRef,
      textureManagerRef,
      transformOnlyPaintNodeIdsRef,
    });
  const { selectionOverlaySourceElement, selectionOverlaySurfaces } =
    useGpuFlowSelectionOverlaySources({
      nodeDomTransformSyncCacheRef,
      nodeElementByIdRef,
      primaryNodeId,
      surfaceRef,
      textureManagerRef,
      transformOnlyPaintNodeIdsRef,
      viewportStore,
    });

  const htmlSurfaceOverlays = useMemo(
    () => [
      ...edgeLabelSurfaces,
      ...retainedDomControlSnapshotSurfaces,
      ...selectionOverlaySurfaces,
      ...nodeResizeOverlaySurfaces,
      ...nodeDragPreviewSurfaces,
    ],
    [
      edgeLabelSurfaces,
      nodeDragPreviewSurfaces,
      nodeResizeOverlaySurfaces,
      retainedDomControlSnapshotSurfaces,
      selectionOverlaySurfaces,
    ],
  );

  return {
    edgeLabelSourceElement,
    htmlSurfaceNativeVisuals: retainedContentNativeVisuals,
    htmlSurfaceOverlays,
    nodeDragPreviewSourceElement,
    nodeResizeOverlaySourceElement,
    retainedDomControlSnapshotSourceElement,
    selectionOverlaySourceElement,
  };
}

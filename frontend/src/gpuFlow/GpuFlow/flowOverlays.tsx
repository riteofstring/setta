import { useMemo, type MutableRefObject, type ReactNode } from "react";

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
import { useGpuFlowNodeDragPreviewSources } from "./nodeDragPreviewOverlay";
import { useGpuFlowNodeResizeOverlaySources } from "./nodeResizeOverlay";
import { useGpuFlowRetainedContentSources } from "./retainedContentSources";
import {
  useGpuFlowRetainedDomControlSources,
  type GpuRetainedDomControlRenderer,
} from "./retainedDomControlSources";
import { useGpuFlowSelectionOverlaySources } from "./selectionOverlay";

type GpuFlowOverlaySources = {
  readonly edgeLabelSourceElement: ReactNode;
  readonly htmlSurfaceNativeVisuals: readonly HtmlSurfaceSolidRoundedRectVisual[];
  readonly htmlSurfaceOverlays: readonly GpuHtmlSurfaceOverlayLayout[];
  readonly nodeDragPreviewSourceElement: ReactNode;
  readonly nodeResizeOverlaySourceElement: ReactNode;
  readonly retainedDomControlSourceElement: ReactNode;
  readonly selectionOverlaySourceElement: ReactNode;
};

export function useGpuFlowOverlaySources({
  edgeScene,
  layoutStore,
  retainedDomControlElementByIdRef,
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
  readonly edgeScene: GpuEdgeScene | undefined;
  readonly layoutStore: GpuFlowLayoutStoreApi | undefined;
  readonly retainedDomControlElementByIdRef: MutableRefObject<
    Map<string, HTMLElement>
  >;
  readonly nodeDomTransformSyncCacheRef: MutableRefObject<GpuNodeDomTransformSyncCache>;
  readonly nodeElementByIdRef: MutableRefObject<Map<string, HTMLElement>>;
  readonly nodes: readonly GpuFlowLayoutNode[] | undefined;
  readonly primaryNodeId: string | null;
  readonly renderRetainedDomControl: GpuRetainedDomControlRenderer | undefined;
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
  const { retainedDomControlSourceElement } =
    useGpuFlowRetainedDomControlSources({
      elementBySourceIdRef: retainedDomControlElementByIdRef,
      renderSource: renderRetainedDomControl,
      retainedRuntimeFrame,
      surfaceRef,
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
      ...selectionOverlaySurfaces,
      ...nodeResizeOverlaySurfaces,
      ...nodeDragPreviewSurfaces,
    ],
    [
      edgeLabelSurfaces,
      nodeDragPreviewSurfaces,
      nodeResizeOverlaySurfaces,
      selectionOverlaySurfaces,
    ],
  );

  return {
    edgeLabelSourceElement,
    htmlSurfaceNativeVisuals: retainedContentNativeVisuals,
    htmlSurfaceOverlays,
    nodeDragPreviewSourceElement,
    nodeResizeOverlaySourceElement,
    retainedDomControlSourceElement,
    selectionOverlaySourceElement,
  };
}

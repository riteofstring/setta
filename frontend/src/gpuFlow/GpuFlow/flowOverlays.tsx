import {
  useEffect,
  useMemo,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";

import type { GpuEdgeScene } from "../edges/edgeSources";
import type { GpuSurfaceHandle } from "../GpuSurface";
import type {
  GpuHtmlSurfaceOverlayLayout,
  GpuNodeDomTransformSyncCache,
} from "../htmlSurfaces/frame";
import type { HtmlSurfaceTextureManager } from "../htmlSurfaces/textures";
import type { HtmlSurfaceSolidRoundedRectVisual } from "../htmlSurfaces/visualScene";
import type { GpuFlowLayoutNode, GpuFlowLayoutStoreApi } from "../layoutStore";
import type { GpuRetainedContentSwitchAnimationStore } from "../retainedContentSwitchAnimation";
import type { GpuFlowScene } from "../scene";
import { chooseStableZoomBucket } from "../textureResolution";
import { normalizeGpuViewport } from "../viewportMath";
import type { GpuFlowViewportStoreApi } from "../viewportStore";
import { useGpuFlowEdgeLabelSources } from "./edgeLabelSources";
import { useGpuFlowNodeDragPreviewSources } from "./nodeDragPreviewOverlay";
import { useGpuFlowNodeResizeOverlaySources } from "./nodeResizeOverlay";
import { useGpuFlowRetainedContentSources } from "./retainedContentSources";
import { useGpuFlowSelectionOverlaySources } from "./selectionOverlay";

export type GpuFlowOverlaySources = {
  readonly edgeLabelSourceElement: ReactNode;
  readonly htmlSurfaceNativeVisuals: readonly HtmlSurfaceSolidRoundedRectVisual[];
  readonly htmlSurfaceOverlays: readonly GpuHtmlSurfaceOverlayLayout[];
  readonly nodeDragPreviewSourceElement: ReactNode;
  readonly nodeResizeOverlaySourceElement: ReactNode;
  readonly retainedContentSourceElement: ReactNode;
  readonly selectionOverlaySourceElement: ReactNode;
};

export function useGpuFlowOverlaySources({
  activeResizeNodeIdRef,
  edgeScene,
  layoutStore,
  nodeDomTransformSyncCacheRef,
  nodeElementByIdRef,
  nodes,
  primaryNodeId,
  scene,
  surfaceRef,
  switchAnimations,
  textureManagerRef,
  transformOnlyPaintNodeIdsRef,
  viewportStore,
}: {
  readonly activeResizeNodeIdRef: MutableRefObject<string | null>;
  readonly edgeScene: GpuEdgeScene | undefined;
  readonly layoutStore: GpuFlowLayoutStoreApi | undefined;
  readonly nodeDomTransformSyncCacheRef: MutableRefObject<GpuNodeDomTransformSyncCache>;
  readonly nodeElementByIdRef: MutableRefObject<Map<string, HTMLElement>>;
  readonly nodes: readonly GpuFlowLayoutNode[] | undefined;
  readonly primaryNodeId: string | null;
  readonly scene: GpuFlowScene | undefined;
  readonly surfaceRef: MutableRefObject<GpuSurfaceHandle | null>;
  readonly switchAnimations: GpuRetainedContentSwitchAnimationStore;
  readonly textureManagerRef: MutableRefObject<HtmlSurfaceTextureManager | null>;
  readonly transformOnlyPaintNodeIdsRef: MutableRefObject<Set<string>>;
  readonly viewportStore: GpuFlowViewportStoreApi;
}): GpuFlowOverlaySources {
  const retainedContentViewportZoomBucket =
    useGpuFlowRetainedContentViewportZoomBucket(viewportStore);
  const { edgeLabelSourceElement, edgeLabelSurfaces } =
    useGpuFlowEdgeLabelSources({
      edgeScene,
      nodeDomTransformSyncCacheRef,
      nodeElementByIdRef,
      surfaceRef,
      textureManagerRef,
      transformOnlyPaintNodeIdsRef,
    });
  const {
    retainedContentNativeVisuals,
    retainedContentSourceElement,
    retainedContentSurfaces,
  } = useGpuFlowRetainedContentSources({
    activeResizeNodeIdRef,
    nodeDomTransformSyncCacheRef,
    nodeElementByIdRef,
    scene,
    surfaceRef,
    switchAnimations,
    textureManagerRef,
    transformOnlyPaintNodeIdsRef,
    viewportZoomBucket: retainedContentViewportZoomBucket,
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
      ...retainedContentSurfaces,
      ...edgeLabelSurfaces,
      ...selectionOverlaySurfaces,
      ...nodeResizeOverlaySurfaces,
      ...nodeDragPreviewSurfaces,
    ],
    [
      edgeLabelSurfaces,
      nodeDragPreviewSurfaces,
      nodeResizeOverlaySurfaces,
      retainedContentSurfaces,
      selectionOverlaySurfaces,
    ],
  );

  return {
    edgeLabelSourceElement,
    htmlSurfaceNativeVisuals: retainedContentNativeVisuals,
    htmlSurfaceOverlays,
    nodeDragPreviewSourceElement,
    nodeResizeOverlaySourceElement,
    retainedContentSourceElement,
    selectionOverlaySourceElement,
  };
}

function useGpuFlowRetainedContentViewportZoomBucket(
  viewportStore: GpuFlowViewportStoreApi,
): number {
  const [zoomBucket, setZoomBucket] = useState(() =>
    getGpuFlowRetainedContentViewportZoomBucket(viewportStore),
  );

  useEffect(() => {
    const syncZoomBucket = () => {
      const zoom = getGpuFlowRetainedContentViewportZoom(viewportStore);
      setZoomBucket((currentZoomBucket) =>
        chooseStableZoomBucket(zoom, { currentZoomBucket }),
      );
    };
    syncZoomBucket();
    return viewportStore.subscribe((state, previousState) => {
      if (state.transform === previousState.transform) {
        return;
      }
      syncZoomBucket();
    });
  }, [viewportStore]);

  return zoomBucket;
}

function getGpuFlowRetainedContentViewportZoomBucket(
  viewportStore: GpuFlowViewportStoreApi,
): number {
  return chooseStableZoomBucket(
    getGpuFlowRetainedContentViewportZoom(viewportStore),
  );
}

function getGpuFlowRetainedContentViewportZoom(
  viewportStore: GpuFlowViewportStoreApi,
): number {
  return normalizeGpuViewport(viewportStore.getState().transform).zoom;
}

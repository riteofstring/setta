import {
  useCallback,
  useMemo,
  type MutableRefObject,
  type ReactNode,
} from "react";

import type { GpuEdgeScene, GpuEdgeSceneLabel } from "../edges/edgeSources";
import {
  getGpuEdgeLabelSurfaceLayouts,
  GpuEdgeLabelSurfaceLayer,
} from "../GpuEdgeLabelSurfaces";
import type { GpuSurfaceHandle } from "../GpuSurface";
import {
  clearGpuNodeDomTransformSyncCacheNode,
  type GpuHtmlSurfaceOverlayLayout,
  type GpuNodeDomTransformSyncCache,
} from "../htmlSurfaces/frame";
import type { HtmlSurfaceTextureManager } from "../htmlSurfaces/textures";

const EMPTY_EDGE_LABELS: readonly GpuEdgeSceneLabel[] = [];

export function useGpuFlowEdgeLabelSources({
  edgeScene,
  nodeDomTransformSyncCacheRef,
  nodeElementByIdRef,
  surfaceRef,
  textureManagerRef,
  transformOnlyPaintNodeIdsRef,
}: {
  readonly edgeScene: GpuEdgeScene | undefined;
  readonly nodeDomTransformSyncCacheRef: MutableRefObject<GpuNodeDomTransformSyncCache>;
  readonly nodeElementByIdRef: MutableRefObject<Map<string, HTMLElement>>;
  readonly surfaceRef: MutableRefObject<GpuSurfaceHandle | null>;
  readonly textureManagerRef: MutableRefObject<HtmlSurfaceTextureManager | null>;
  readonly transformOnlyPaintNodeIdsRef: MutableRefObject<Set<string>>;
}): {
  readonly edgeLabelSourceElement: ReactNode;
  readonly edgeLabelSurfaces: readonly GpuHtmlSurfaceOverlayLayout[];
} {
  const edgeLabels = edgeScene?.labels ?? EMPTY_EDGE_LABELS;
  const edgeLabelSurfaces = useMemo(
    () => getGpuEdgeLabelSurfaceLayouts(edgeLabels),
    [edgeLabels],
  );
  const handleEdgeLabelElementChange = useCallback(
    (surfaceId: string, element: HTMLElement | null) => {
      clearGpuNodeDomTransformSyncCacheNode(
        nodeDomTransformSyncCacheRef.current,
        surfaceId,
      );
      if (!element) {
        nodeElementByIdRef.current.delete(surfaceId);
        transformOnlyPaintNodeIdsRef.current.delete(surfaceId);
        textureManagerRef.current?.destroySurfaceTexture(surfaceId);
        return;
      }
      nodeElementByIdRef.current.set(surfaceId, element);
      surfaceRef.current?.requestPaint();
      surfaceRef.current?.requestFrame("manual");
    },
    [
      nodeDomTransformSyncCacheRef,
      nodeElementByIdRef,
      surfaceRef,
      textureManagerRef,
      transformOnlyPaintNodeIdsRef,
    ],
  );

  return {
    edgeLabelSourceElement: (
      <GpuEdgeLabelSurfaceLayer
        labels={edgeLabels}
        onLabelElementChange={handleEdgeLabelElementChange}
      />
    ),
    edgeLabelSurfaces,
  };
}

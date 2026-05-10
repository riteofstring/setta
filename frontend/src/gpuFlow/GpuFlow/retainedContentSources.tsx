import {
  useCallback,
  useMemo,
  useRef,
  type MutableRefObject,
  type ReactNode,
} from "react";

import { getGpuRetainedContentScrollbarVisuals } from "../GpuRetainedContentScrollbarVisuals";
import {
  getGpuRetainedContentSurfaceLayouts,
  GpuRetainedContentSurfaceLayer,
  type GpuRetainedContentSurfaceDrawEvent,
} from "../GpuRetainedContentSurfaces";
import type { GpuSurfaceHandle } from "../GpuSurface";
import {
  clearGpuNodeDomTransformSyncCacheNode,
  type GpuHtmlSurfaceOverlayLayout,
  type GpuNodeDomTransformSyncCache,
} from "../htmlSurfaces/frame";
import type { HtmlSurfaceTextureManager } from "../htmlSurfaces/textures";
import type { HtmlSurfaceSolidRoundedRectVisual } from "../htmlSurfaces/visualScene";
import type { GpuRetainedContentSwitchAnimationStore } from "../retainedContentSwitchAnimation";
import type { GpuFlowScene } from "../scene";

type GpuFlowRetainedContentSourceTextureManager = Pick<
  HtmlSurfaceTextureManager,
  "destroySurfaceTexture" | "markSurfaceTextureDirty"
>;

export function useGpuFlowRetainedContentSources({
  activeResizeNodeIdRef,
  nodeDomTransformSyncCacheRef,
  nodeElementByIdRef,
  scene,
  surfaceRef,
  switchAnimations,
  textureManagerRef,
  transformOnlyPaintNodeIdsRef,
  viewportZoomBucket = 1,
}: {
  readonly activeResizeNodeIdRef: MutableRefObject<string | null>;
  readonly nodeDomTransformSyncCacheRef: MutableRefObject<GpuNodeDomTransformSyncCache>;
  readonly nodeElementByIdRef: MutableRefObject<Map<string, HTMLElement>>;
  readonly scene: GpuFlowScene | undefined;
  readonly surfaceRef: MutableRefObject<GpuSurfaceHandle | null>;
  readonly switchAnimations: GpuRetainedContentSwitchAnimationStore;
  readonly textureManagerRef: MutableRefObject<GpuFlowRetainedContentSourceTextureManager | null>;
  readonly transformOnlyPaintNodeIdsRef: MutableRefObject<Set<string>>;
  readonly viewportZoomBucket?: number | undefined;
}): {
  readonly retainedContentSourceElement: ReactNode;
  readonly retainedContentNativeVisuals: readonly HtmlSurfaceSolidRoundedRectVisual[];
  readonly retainedContentSurfaces: readonly GpuHtmlSurfaceOverlayLayout[];
} {
  const retainedContentSurfaces = useMemo(
    () => getGpuRetainedContentSurfaceLayouts(scene?.contentSurfaces),
    [scene?.contentSurfaces],
  );
  const retainedContentNativeVisuals = useMemo(
    () => getGpuRetainedContentScrollbarVisuals(scene?.contentSurfaces),
    [scene?.contentSurfaces],
  );
  const retainedContentOwnerBySurfaceId = useMemo(
    () =>
      new Map(
        retainedContentSurfaces.flatMap((surface): [string, string][] =>
          surface.ownerNodeId ? [[surface.surfaceId, surface.ownerNodeId]] : [],
        ),
      ),
    [retainedContentSurfaces],
  );
  const retainedContentOwnerBySurfaceIdRef = useRef(
    retainedContentOwnerBySurfaceId,
  );
  retainedContentOwnerBySurfaceIdRef.current = retainedContentOwnerBySurfaceId;
  const handleRetainedContentElementChange = useCallback(
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
  const handleRetainedContentSurfaceDraw = useCallback(
    (surfaceId: string, event: GpuRetainedContentSurfaceDrawEvent) => {
      const queued = textureManagerRef.current?.markSurfaceTextureDirty({
        content: true,
        priority:
          event.reason === "animation" ||
          retainedContentOwnerBySurfaceIdRef.current.get(surfaceId) ===
            activeResizeNodeIdRef.current
            ? "interactive"
            : "visible",
        reason: event.reason,
        requestPaint: false,
        ...(event.sourceRect ? { sourceRect: event.sourceRect } : {}),
        surfaceId,
      });
      if (queued) {
        surfaceRef.current?.requestFrame("texture-upload");
      }
    },
    [activeResizeNodeIdRef, surfaceRef, textureManagerRef],
  );

  return {
    retainedContentSourceElement: (
      <GpuRetainedContentSurfaceLayer
        onSurfaceDraw={handleRetainedContentSurfaceDraw}
        onSurfaceElementChange={handleRetainedContentElementChange}
        surfaces={scene?.contentSurfaces}
        switchAnimations={switchAnimations}
        viewportZoomBucket={viewportZoomBucket}
      />
    ),
    retainedContentNativeVisuals,
    retainedContentSurfaces,
  };
}

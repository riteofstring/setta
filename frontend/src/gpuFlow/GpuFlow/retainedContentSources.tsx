import {
  useCallback,
  useMemo,
  type MutableRefObject,
  type ReactNode,
} from "react";

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
import type { GpuRetainedContentSwitchAnimationStore } from "../retainedContentSwitchAnimation";
import type { GpuFlowScene } from "../scene";

export function useGpuFlowRetainedContentSources({
  nodeDomTransformSyncCacheRef,
  nodeElementByIdRef,
  scene,
  surfaceRef,
  switchAnimations,
  textureManagerRef,
  transformOnlyPaintNodeIdsRef,
}: {
  readonly nodeDomTransformSyncCacheRef: MutableRefObject<GpuNodeDomTransformSyncCache>;
  readonly nodeElementByIdRef: MutableRefObject<Map<string, HTMLElement>>;
  readonly scene: GpuFlowScene | undefined;
  readonly surfaceRef: MutableRefObject<GpuSurfaceHandle | null>;
  readonly switchAnimations: GpuRetainedContentSwitchAnimationStore;
  readonly textureManagerRef: MutableRefObject<HtmlSurfaceTextureManager | null>;
  readonly transformOnlyPaintNodeIdsRef: MutableRefObject<Set<string>>;
}): {
  readonly retainedContentSourceElement: ReactNode;
  readonly retainedContentSurfaces: readonly GpuHtmlSurfaceOverlayLayout[];
} {
  const retainedContentSurfaces = useMemo(
    () => getGpuRetainedContentSurfaceLayouts(scene?.contentSurfaces),
    [scene?.contentSurfaces],
  );
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
      textureManagerRef.current?.markSurfaceTextureDirty({
        content: true,
        priority: event.reason === "animation" ? "interactive" : "visible",
        reason: event.reason,
        requestPaint: false,
        ...(event.sourceRect ? { sourceRect: event.sourceRect } : {}),
        surfaceId,
      });
      surfaceRef.current?.requestPaint();
      surfaceRef.current?.requestFrame(
        event.reason === "animation" ? "texture-upload" : "manual",
      );
    },
    [surfaceRef, textureManagerRef],
  );

  return {
    retainedContentSourceElement: (
      <GpuRetainedContentSurfaceLayer
        onSurfaceDraw={handleRetainedContentSurfaceDraw}
        onSurfaceElementChange={handleRetainedContentElementChange}
        surfaces={scene?.contentSurfaces}
        switchAnimations={switchAnimations}
      />
    ),
    retainedContentSurfaces,
  };
}

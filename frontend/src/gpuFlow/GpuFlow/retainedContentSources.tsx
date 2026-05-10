import { useMemo, type MutableRefObject, type ReactNode } from "react";

import { getGpuRetainedContentScrollbarVisuals } from "../GpuRetainedContentScrollbarVisuals";
import type { GpuSurfaceHandle } from "../GpuSurface";
import type {
  GpuHtmlSurfaceOverlayLayout,
  GpuNodeDomTransformSyncCache,
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
  scene,
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
  const retainedContentNativeVisuals = useMemo(
    () => getGpuRetainedContentScrollbarVisuals(scene?.contentSurfaces),
    [scene?.contentSurfaces],
  );

  return {
    retainedContentNativeVisuals,
    retainedContentSourceElement: null,
    retainedContentSurfaces: [],
  };
}

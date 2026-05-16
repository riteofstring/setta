import type { GpuHtmlSurfaceOverlayLayout } from "../htmlSurfaces/frame";
import type { HtmlSurfaceTextureManager } from "../htmlSurfaces/textures";
import type { HtmlSurfaceSolidRoundedRectVisual } from "../htmlSurfaces/visualScene";
import type { GpuRetainedContentRowHoverTarget } from "../retainedContentRowHover";
import type { GpuRetainedContentScrollOffsetMap } from "../retainedContentScroll";
import type { GpuRetainedContentScrollbarVisualState } from "../retainedContentScrollbar";
import type { RetainedContentTexturePageManager } from "../retainedContentTexturePageManager";
import type { GpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";
import type { GpuContentSurface, GpuFlowScene } from "../scene";

export type GpuFlowRetainedContentNodeLayerState = {
  readonly edgeLabelSurfaces?:
    | readonly GpuHtmlSurfaceOverlayLayout[]
    | undefined;
  readonly htmlSurfaceNativeVisuals?:
    | readonly HtmlSurfaceSolidRoundedRectVisual[]
    | undefined;
  readonly retainedContentRowHoverTarget?:
    | GpuRetainedContentRowHoverTarget
    | null
    | undefined;
  readonly retainedContentRuntimeScrollOffsets?:
    | GpuRetainedContentScrollOffsetMap
    | undefined;
  readonly retainedRuntimeFrame?: GpuRetainedRuntimeFrame | null | undefined;
  readonly retainedContentScrollbarVisualState?:
    | GpuRetainedContentScrollbarVisualState
    | undefined;
  readonly scene: GpuFlowScene | undefined;
};

export type GpuFlowRetainedContentTextureManager = Pick<
  HtmlSurfaceTextureManager,
  "markSurfaceTextureDirty"
>;
export type GpuFlowRetainedContentPageManager = Pick<
  RetainedContentTexturePageManager,
  "markSurfaceContentDirty"
>;

export type GpuRetainedContentSurfaceWithScene = GpuContentSurface & {
  readonly retainedScene: NonNullable<GpuContentSurface["retainedScene"]>;
};

export function mergeGpuFlowRetainedContentSurfaceLayouts({
  overlays,
}: {
  readonly overlays: readonly GpuHtmlSurfaceOverlayLayout[] | undefined;
  readonly scene: GpuFlowScene;
}): readonly GpuHtmlSurfaceOverlayLayout[] {
  return overlays ?? [];
}

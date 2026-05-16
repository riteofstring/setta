import type { MutableRefObject } from "react";

import { getGpuRetainedContentSourceIdsForSurface } from "../GpuRetainedContentSurfaces";
import type { GpuSurfaceHandle } from "../GpuSurface";
import type { GpuHtmlSurfaceOverlayLayout } from "../htmlSurfaces/frame";
import type { HtmlSurfaceTextureManager } from "../htmlSurfaces/textures";
import type { HtmlSurfaceSolidRoundedRectVisual } from "../htmlSurfaces/visualScene";
import type { GpuRetainedContentRowHoverTarget } from "../retainedContentRowHover";
import type { GpuRetainedContentScrollOffsetMap } from "../retainedContentScroll";
import type { GpuRetainedContentScrollbarVisualState } from "../retainedContentScrollbar";
import type { GpuRetainedContentSwitchAnimationStore } from "../retainedContentSwitchAnimation";
import type { RetainedContentTexturePageManager } from "../retainedContentTexturePageManager";
import type { GpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";
import type { GpuContentSurface, GpuFlowScene } from "../scene";
import type { GpuRect } from "../viewportMath";

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

export function redrawGpuFlowRetainedContentSurfaceSources({
  deferTextureUploadUntilPaint = false,
  dirtySourceRectsBySurfaceId,
  nodeElementByIdRef,
  retainedContentPageManagerRef,
  surfaceRef,
  surfaces,
  switchAnimations,
  textureManagerRef,
}: {
  readonly deferTextureUploadUntilPaint?: boolean | undefined;
  readonly dirtySourceRectsBySurfaceId?:
    | ReadonlyMap<string, GpuRect>
    | undefined;
  readonly nodeElementByIdRef: MutableRefObject<Map<string, HTMLElement>>;
  readonly retainedContentPageManagerRef: MutableRefObject<GpuFlowRetainedContentPageManager | null>;
  readonly surfaceRef: MutableRefObject<GpuSurfaceHandle | null>;
  readonly surfaces: readonly GpuRetainedContentSurfaceWithScene[];
  readonly switchAnimations: GpuRetainedContentSwitchAnimationStore;
  readonly textureManagerRef: MutableRefObject<GpuFlowRetainedContentTextureManager | null>;
}) {
  let redrawn = false;
  for (const surface of surfaces) {
    if (
      redrawGpuFlowRetainedContentSurfaceSourceIds({
        deferTextureUploadUntilPaint,
        dirtySourceRectsBySurfaceId,
        nodeElementByIdRef,
        retainedContentPageManagerRef,
        surface,
        switchAnimations,
        textureManagerRef,
      })
    ) {
      redrawn = true;
    }
  }
  if (redrawn) {
    if (deferTextureUploadUntilPaint) {
      surfaceRef.current?.requestPaint();
      return;
    }
    surfaceRef.current?.requestFrame("texture-upload");
  }
}

function redrawGpuFlowRetainedContentSurfaceSourceIds({
  deferTextureUploadUntilPaint,
  dirtySourceRectsBySurfaceId,
  nodeElementByIdRef,
  retainedContentPageManagerRef,
  surface,
  switchAnimations,
  textureManagerRef,
}: {
  readonly deferTextureUploadUntilPaint: boolean;
  readonly dirtySourceRectsBySurfaceId?:
    | ReadonlyMap<string, GpuRect>
    | undefined;
  readonly nodeElementByIdRef: MutableRefObject<Map<string, HTMLElement>>;
  readonly retainedContentPageManagerRef: MutableRefObject<GpuFlowRetainedContentPageManager | null>;
  readonly surface: GpuRetainedContentSurfaceWithScene;
  readonly switchAnimations: GpuRetainedContentSwitchAnimationStore;
  readonly textureManagerRef: MutableRefObject<GpuFlowRetainedContentTextureManager | null>;
}): boolean {
  let redrawn = false;
  for (const sourceId of getGpuRetainedContentSourceIdsForSurface(surface)) {
    if (
      redrawGpuFlowRetainedContentSurfaceSource({
        deferTextureUploadUntilPaint,
        dirtySourceRect: dirtySourceRectsBySurfaceId?.get(sourceId),
        nodeElementByIdRef,
        retainedContentPageManagerRef,
        sourceId,
        surface,
        switchAnimations,
        textureManagerRef,
      })
    ) {
      redrawn = true;
    }
  }
  return redrawn;
}

function redrawGpuFlowRetainedContentSurfaceSource({
  deferTextureUploadUntilPaint,
  dirtySourceRect,
  nodeElementByIdRef,
  retainedContentPageManagerRef,
  sourceId,
  surface,
  switchAnimations,
  textureManagerRef,
}: {
  readonly deferTextureUploadUntilPaint: boolean;
  readonly dirtySourceRect: GpuRect | undefined;
  readonly nodeElementByIdRef: MutableRefObject<Map<string, HTMLElement>>;
  readonly retainedContentPageManagerRef: MutableRefObject<GpuFlowRetainedContentPageManager | null>;
  readonly sourceId: string;
  readonly surface: GpuRetainedContentSurfaceWithScene;
  readonly switchAnimations: GpuRetainedContentSwitchAnimationStore;
  readonly textureManagerRef: MutableRefObject<GpuFlowRetainedContentTextureManager | null>;
}): boolean {
  void deferTextureUploadUntilPaint;
  void nodeElementByIdRef;
  void surface;
  void switchAnimations;
  void textureManagerRef;
  return Boolean(
    retainedContentPageManagerRef.current?.markSurfaceContentDirty({
      frame: 0,
      priority: "visible",
      ...(dirtySourceRect ? { sourceRect: dirtySourceRect } : {}),
      surfaceId: sourceId,
    }),
  );
}

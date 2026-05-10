import type { MutableRefObject } from "react";

import { postChromeReproEvent } from "state/actions/chromeRepro";

import { getGpuRetainedContentScrollbarVisuals } from "../GpuRetainedContentScrollbarVisuals";
import {
  getGpuRetainedContentSourceIdsForSurface,
  getGpuRetainedContentSourceRectForRows,
  getGpuRetainedContentSurfaceLayouts,
  redrawGpuRetainedContentSourceElement,
} from "../GpuRetainedContentSurfaces";
import type { GpuSurfaceHandle } from "../GpuSurface";
import type { GpuHtmlSurfaceOverlayLayout } from "../htmlSurfaces/frame";
import type { HtmlSurfaceTextureManager } from "../htmlSurfaces/textures";
import type { HtmlSurfaceSolidRoundedRectVisual } from "../htmlSurfaces/visualScene";
import {
  applyGpuRetainedContentRowHoverStateToScene,
  type GpuRetainedContentRowHoverTarget,
} from "../retainedContentRowHover";
import type { GpuRetainedContentSwitchAnimationStore } from "../retainedContentSwitchAnimation";
import type { GpuContentSurface, GpuFlowScene } from "../scene";
import type { GpuRect } from "../viewportMath";

export type GpuFlowRetainedContentNodeLayerState = {
  readonly edgeLabelSurfaces?:
    | readonly GpuHtmlSurfaceOverlayLayout[]
    | undefined;
  readonly htmlSurfaceNativeVisuals?:
    | readonly HtmlSurfaceSolidRoundedRectVisual[]
    | undefined;
  readonly scene: GpuFlowScene | undefined;
};

export type GpuFlowRetainedContentTextureManager = Pick<
  HtmlSurfaceTextureManager,
  "markSurfaceTextureDirty"
>;

export type GpuRetainedContentSurfaceWithScene = GpuContentSurface & {
  readonly retainedScene: NonNullable<GpuContentSurface["retainedScene"]>;
};

export function applyGpuFlowRetainedContentRowHoverState({
  nodeElementByIdRef,
  nodeLayerRef,
  previousTarget,
  recentDirtyRowIdsBySurfaceId,
  surfaceRef,
  surfaceIds,
  switchAnimations,
  target,
  textureManagerRef,
}: {
  readonly nodeElementByIdRef: MutableRefObject<Map<string, HTMLElement>>;
  readonly nodeLayerRef: MutableRefObject<GpuFlowRetainedContentNodeLayerState>;
  readonly previousTarget: GpuRetainedContentRowHoverTarget | null;
  readonly recentDirtyRowIdsBySurfaceId?:
    | ReadonlyMap<string, ReadonlySet<string>>
    | undefined;
  readonly surfaceRef: MutableRefObject<GpuSurfaceHandle | null>;
  readonly surfaceIds?: ReadonlySet<string> | undefined;
  readonly switchAnimations: GpuRetainedContentSwitchAnimationStore;
  readonly target: GpuRetainedContentRowHoverTarget | null;
  readonly textureManagerRef: MutableRefObject<GpuFlowRetainedContentTextureManager | null>;
}): GpuFlowScene | undefined {
  const scene = nodeLayerRef.current.scene;
  if (!scene) {
    return scene;
  }
  const update = applyGpuRetainedContentRowHoverStateToScene({
    scene,
    surfaceIds,
    target,
  });
  const nextScene = update?.scene ?? scene;
  commitGpuFlowRetainedContentSceneUpdate({
    nodeLayerRef,
    scene: nextScene,
    shouldCommit: Boolean(update),
  });
  redrawGpuFlowRetainedContentRowHoverSurfaces({
    changedRowIdsBySurfaceId: update?.changedRowIdsBySurfaceId,
    nodeElementByIdRef,
    previousTarget,
    recentDirtyRowIdsBySurfaceId,
    scene: nextScene,
    surfaceRef,
    switchAnimations,
    target,
    textureManagerRef,
    updatedSurfaces: update?.surfaces ?? [],
  });
  return nextScene;
}

export function getGpuFlowRetainedContentRowHoverSurfaceIds(
  previousTarget: GpuRetainedContentRowHoverTarget | null,
  nextTarget: GpuRetainedContentRowHoverTarget | null,
): ReadonlySet<string> {
  return new Set(
    [previousTarget?.surfaceId, nextTarget?.surfaceId].filter(
      (surfaceId): surfaceId is string => Boolean(surfaceId),
    ),
  );
}

export function mergeGpuFlowRetainedContentSurfaceLayouts({
  overlays,
  scene,
}: {
  readonly overlays: readonly GpuHtmlSurfaceOverlayLayout[] | undefined;
  readonly scene: GpuFlowScene;
}): readonly GpuHtmlSurfaceOverlayLayout[] {
  const retainedLayouts = getGpuRetainedContentSurfaceLayouts(
    scene.contentSurfaces,
  );
  if (retainedLayouts.length === 0) {
    return overlays ?? [];
  }
  const retainedLayoutById = new Map(
    retainedLayouts.map((layout) => [layout.surfaceId, layout]),
  );
  const seenRetainedSurfaceIds = new Set<string>();
  const nextOverlays: GpuHtmlSurfaceOverlayLayout[] = [];
  for (const overlay of overlays ?? []) {
    const retainedLayout = retainedLayoutById.get(overlay.surfaceId);
    if (!retainedLayout) {
      nextOverlays.push(overlay);
      continue;
    }
    seenRetainedSurfaceIds.add(overlay.surfaceId);
    nextOverlays.push(retainedLayout);
  }
  for (const retainedLayout of retainedLayouts) {
    if (!seenRetainedSurfaceIds.has(retainedLayout.surfaceId)) {
      nextOverlays.push(retainedLayout);
    }
  }
  return nextOverlays;
}

export function redrawGpuFlowRetainedContentSurfaceSources({
  deferTextureUploadUntilPaint = false,
  dirtySourceRectsBySurfaceId,
  nodeElementByIdRef,
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

function commitGpuFlowRetainedContentSceneUpdate({
  nodeLayerRef,
  scene,
  shouldCommit,
}: {
  readonly nodeLayerRef: MutableRefObject<GpuFlowRetainedContentNodeLayerState>;
  readonly scene: GpuFlowScene;
  readonly shouldCommit: boolean;
}) {
  if (!shouldCommit) {
    return;
  }
  nodeLayerRef.current = {
    ...nodeLayerRef.current,
    edgeLabelSurfaces: mergeGpuFlowRetainedContentSurfaceLayouts({
      overlays: nodeLayerRef.current.edgeLabelSurfaces,
      scene,
    }),
    htmlSurfaceNativeVisuals: getGpuRetainedContentScrollbarVisuals(
      scene.contentSurfaces,
    ),
    scene,
  };
}

function redrawGpuFlowRetainedContentRowHoverSurfaces({
  changedRowIdsBySurfaceId,
  nodeElementByIdRef,
  previousTarget,
  recentDirtyRowIdsBySurfaceId,
  scene,
  surfaceRef,
  switchAnimations,
  target,
  textureManagerRef,
  updatedSurfaces,
}: {
  readonly changedRowIdsBySurfaceId?:
    | ReadonlyMap<string, ReadonlySet<string>>
    | undefined;
  readonly nodeElementByIdRef: MutableRefObject<Map<string, HTMLElement>>;
  readonly previousTarget: GpuRetainedContentRowHoverTarget | null;
  readonly recentDirtyRowIdsBySurfaceId?:
    | ReadonlyMap<string, ReadonlySet<string>>
    | undefined;
  readonly scene: GpuFlowScene;
  readonly surfaceRef: MutableRefObject<GpuSurfaceHandle | null>;
  readonly switchAnimations: GpuRetainedContentSwitchAnimationStore;
  readonly target: GpuRetainedContentRowHoverTarget | null;
  readonly textureManagerRef: MutableRefObject<GpuFlowRetainedContentTextureManager | null>;
  readonly updatedSurfaces: readonly GpuRetainedContentSurfaceWithScene[];
}) {
  const dirtyRowIdsBySurfaceId =
    getGpuFlowRetainedContentRowHoverDirtyRowIdsBySurfaceId({
      changedRowIdsBySurfaceId,
      previousTarget,
      recentDirtyRowIdsBySurfaceId,
      target,
    });
  const surfacesToRedraw = getGpuFlowRetainedContentRowHoverSurfacesToRedraw({
    rowIdsBySurfaceId: dirtyRowIdsBySurfaceId,
    scene,
    updatedSurfaces,
  });
  const dirtySourceRectsBySurfaceId =
    getGpuFlowRetainedContentRowHoverDirtySourceRects({
      rowIdsBySurfaceId: dirtyRowIdsBySurfaceId,
      surfaces: surfacesToRedraw,
    });
  const dirtySurfacesToRedraw = surfacesToRedraw.filter((surface) =>
    dirtySourceRectsBySurfaceId.has(surface.id),
  );
  if (dirtySurfacesToRedraw.length === 0) {
    return;
  }
  postGpuFlowRetainedContentRowHoverRedrawChromeReproEvent({
    changedRowIdsBySurfaceId,
    dirtyRowIdsBySurfaceId,
    dirtySourceRectsBySurfaceId,
    previousTarget,
    recentDirtyRowIdsBySurfaceId,
    surfacesToRedraw: dirtySurfacesToRedraw,
    target,
  });
  redrawGpuFlowRetainedContentSurfaceSources({
    deferTextureUploadUntilPaint: true,
    dirtySourceRectsBySurfaceId,
    nodeElementByIdRef,
    surfaceRef,
    surfaces: dirtySurfacesToRedraw,
    switchAnimations,
    textureManagerRef,
  });
}

function getGpuFlowRetainedContentRowHoverDirtyRowIdsBySurfaceId({
  changedRowIdsBySurfaceId,
  previousTarget,
  recentDirtyRowIdsBySurfaceId,
  target,
}: {
  readonly changedRowIdsBySurfaceId?:
    | ReadonlyMap<string, ReadonlySet<string>>
    | undefined;
  readonly previousTarget: GpuRetainedContentRowHoverTarget | null;
  readonly recentDirtyRowIdsBySurfaceId?:
    | ReadonlyMap<string, ReadonlySet<string>>
    | undefined;
  readonly target: GpuRetainedContentRowHoverTarget | null;
}): ReadonlyMap<string, ReadonlySet<string>> {
  const rowIdsBySurfaceId = new Map<string, Set<string>>();
  for (const [surfaceId, rowIds] of changedRowIdsBySurfaceId ?? []) {
    const nextRowIds = new Set(rowIds);
    if (nextRowIds.size > 0) {
      rowIdsBySurfaceId.set(surfaceId, nextRowIds);
    }
  }
  for (const [surfaceId, rowIds] of recentDirtyRowIdsBySurfaceId ?? []) {
    const nextRowIds = rowIdsBySurfaceId.get(surfaceId) ?? new Set<string>();
    for (const rowId of rowIds) {
      nextRowIds.add(rowId);
    }
    if (nextRowIds.size > 0) {
      rowIdsBySurfaceId.set(surfaceId, nextRowIds);
    }
  }
  addGpuFlowRetainedContentRowHoverDirtyRowId(
    rowIdsBySurfaceId,
    previousTarget,
  );
  addGpuFlowRetainedContentRowHoverDirtyRowId(rowIdsBySurfaceId, target);
  return rowIdsBySurfaceId;
}

function addGpuFlowRetainedContentRowHoverDirtyRowId(
  rowIdsBySurfaceId: Map<string, Set<string>>,
  target: GpuRetainedContentRowHoverTarget | null,
) {
  if (!target) {
    return;
  }
  const rowIds = rowIdsBySurfaceId.get(target.surfaceId) ?? new Set<string>();
  rowIds.add(target.rowId);
  rowIdsBySurfaceId.set(target.surfaceId, rowIds);
}

function getGpuFlowRetainedContentRowHoverSurfacesToRedraw({
  rowIdsBySurfaceId,
  scene,
  updatedSurfaces,
}: {
  readonly rowIdsBySurfaceId: ReadonlyMap<string, ReadonlySet<string>>;
  readonly scene: GpuFlowScene;
  readonly updatedSurfaces: readonly GpuRetainedContentSurfaceWithScene[];
}): readonly GpuRetainedContentSurfaceWithScene[] {
  const surfacesById = new Map<string, GpuRetainedContentSurfaceWithScene>();
  for (const surface of updatedSurfaces) {
    surfacesById.set(surface.id, surface);
  }
  for (const surfaceId of rowIdsBySurfaceId.keys()) {
    if (surfacesById.has(surfaceId)) {
      continue;
    }
    const surface = getGpuFlowRetainedContentSurfaceWithSceneById({
      scene,
      surfaceId,
    });
    if (surface) {
      surfacesById.set(surfaceId, surface);
    }
  }
  return [...surfacesById.values()];
}

function getGpuFlowRetainedContentSurfaceWithSceneById({
  scene,
  surfaceId,
}: {
  readonly scene: GpuFlowScene;
  readonly surfaceId: string;
}): GpuRetainedContentSurfaceWithScene | null {
  const surface = scene.contentSurfaces.find(
    (candidate) => candidate.id === surfaceId,
  );
  if (!surface || !isGpuFlowRetainedContentSurfaceWithScene(surface)) {
    return null;
  }
  return surface;
}

function isGpuFlowRetainedContentSurfaceWithScene(
  surface: GpuContentSurface,
): surface is GpuRetainedContentSurfaceWithScene {
  return (
    surface.renderer.kind === "canvas-content" && Boolean(surface.retainedScene)
  );
}

function getGpuFlowRetainedContentRowHoverDirtySourceRects({
  rowIdsBySurfaceId,
  surfaces,
}: {
  readonly rowIdsBySurfaceId: ReadonlyMap<string, ReadonlySet<string>>;
  readonly surfaces: readonly GpuRetainedContentSurfaceWithScene[];
}): ReadonlyMap<string, GpuRect> {
  const dirtySourceRectsBySurfaceId = new Map<string, GpuRect>();
  for (const surface of surfaces) {
    const rowIds = rowIdsBySurfaceId.get(surface.id);
    if (!rowIds) {
      continue;
    }
    const sourceRect = getGpuRetainedContentSourceRectForRows({
      rowIds,
      surface,
    });
    if (sourceRect) {
      dirtySourceRectsBySurfaceId.set(surface.id, sourceRect);
    }
  }
  return dirtySourceRectsBySurfaceId;
}

function postGpuFlowRetainedContentRowHoverRedrawChromeReproEvent({
  changedRowIdsBySurfaceId,
  dirtyRowIdsBySurfaceId,
  dirtySourceRectsBySurfaceId,
  previousTarget,
  recentDirtyRowIdsBySurfaceId,
  surfacesToRedraw,
  target,
}: {
  readonly changedRowIdsBySurfaceId?:
    | ReadonlyMap<string, ReadonlySet<string>>
    | undefined;
  readonly dirtyRowIdsBySurfaceId: ReadonlyMap<string, ReadonlySet<string>>;
  readonly dirtySourceRectsBySurfaceId: ReadonlyMap<string, GpuRect>;
  readonly previousTarget: GpuRetainedContentRowHoverTarget | null;
  readonly recentDirtyRowIdsBySurfaceId?:
    | ReadonlyMap<string, ReadonlySet<string>>
    | undefined;
  readonly surfacesToRedraw: readonly GpuRetainedContentSurfaceWithScene[];
  readonly target: GpuRetainedContentRowHoverTarget | null;
}) {
  postChromeReproEvent("gpu-flow-retained-row-hover-redraw", {
    changedRowIdsBySurfaceId: rowIdMapToChromeReproPayload(
      changedRowIdsBySurfaceId,
    ),
    deferTextureUploadUntilPaint: true,
    dirtyRowIdsBySurfaceId: rowIdMapToChromeReproPayload(
      dirtyRowIdsBySurfaceId,
    ),
    dirtySourceRectsBySurfaceId: rectMapToChromeReproPayload(
      dirtySourceRectsBySurfaceId,
    ),
    previousTarget,
    recentDirtyRowIdsBySurfaceId: rowIdMapToChromeReproPayload(
      recentDirtyRowIdsBySurfaceId,
    ),
    redrawnSurfaceIds: surfacesToRedraw.map((surface) => surface.id),
    target,
  });
}

function rowIdMapToChromeReproPayload(
  rowIdsBySurfaceId: ReadonlyMap<string, ReadonlySet<string>> | undefined,
): readonly {
  readonly rowIds: readonly string[];
  readonly surfaceId: string;
}[] {
  return [...(rowIdsBySurfaceId ?? [])].map(([surfaceId, rowIds]) => ({
    rowIds: [...rowIds],
    surfaceId,
  }));
}

function rectMapToChromeReproPayload(
  rectsBySurfaceId: ReadonlyMap<string, GpuRect>,
): readonly { readonly rect: GpuRect; readonly surfaceId: string }[] {
  return [...rectsBySurfaceId].map(([surfaceId, rect]) => ({
    rect,
    surfaceId,
  }));
}

function redrawGpuFlowRetainedContentSurfaceSourceIds({
  deferTextureUploadUntilPaint,
  dirtySourceRectsBySurfaceId,
  nodeElementByIdRef,
  surface,
  switchAnimations,
  textureManagerRef,
}: {
  readonly deferTextureUploadUntilPaint: boolean;
  readonly dirtySourceRectsBySurfaceId?:
    | ReadonlyMap<string, GpuRect>
    | undefined;
  readonly nodeElementByIdRef: MutableRefObject<Map<string, HTMLElement>>;
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
  sourceId,
  surface,
  switchAnimations,
  textureManagerRef,
}: {
  readonly deferTextureUploadUntilPaint: boolean;
  readonly dirtySourceRect: GpuRect | undefined;
  readonly nodeElementByIdRef: MutableRefObject<Map<string, HTMLElement>>;
  readonly sourceId: string;
  readonly surface: GpuRetainedContentSurfaceWithScene;
  readonly switchAnimations: GpuRetainedContentSwitchAnimationStore;
  readonly textureManagerRef: MutableRefObject<GpuFlowRetainedContentTextureManager | null>;
}): boolean {
  const sourceElement = nodeElementByIdRef.current.get(sourceId);
  if (!sourceElement) {
    return false;
  }
  const drawEvent = redrawGpuRetainedContentSourceElement({
    element: sourceElement,
    sourceId,
    surface,
    switchAnimations,
  });
  if (!drawEvent) {
    return false;
  }
  const sourceRect = dirtySourceRect ?? drawEvent.sourceRect;
  return Boolean(
    textureManagerRef.current?.markSurfaceTextureDirty({
      content: true,
      ...(deferTextureUploadUntilPaint ? { deferUploadUntilPaint: true } : {}),
      reason: "content",
      requestPaint: false,
      ...(sourceRect ? { sourceRect } : {}),
      surfaceId: sourceId,
    }),
  );
}

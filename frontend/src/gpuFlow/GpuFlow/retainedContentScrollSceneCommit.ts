import type { MutableRefObject } from "react";

import type { GpuSurfaceHandle } from "../GpuSurface";
import {
  getGpuRetainedContentRuntimeScrollOffsets,
  type GpuRetainedContentRuntimeState,
} from "../retainedContentRuntimeState";
import { applyGpuRetainedContentScrollOffsetToScene } from "../retainedContentScroll";
import {
  applyGpuRetainedContentScrollbarVisualStateToScene,
  type GpuRetainedContentScrollbarVisualState,
} from "../retainedContentScrollbar";
import type { GpuRetainedContentSwitchAnimationStore } from "../retainedContentSwitchAnimation";
import type { GpuDomIsland, GpuFlowScene } from "../scene";
import type { GpuViewportInput } from "../viewportMath";
import type { GpuFlowViewportStoreApi } from "../viewportStore";
import {
  hideGpuFlowDomIslandElement,
  syncGpuFlowDomIslandElementStyle,
} from "./domIslandLayer";
import {
  mergeGpuFlowRetainedContentSurfaceLayouts,
  redrawGpuFlowRetainedContentSurfaceSources,
  type GpuFlowRetainedContentNodeLayerState,
  type GpuFlowRetainedContentPageManager,
  type GpuFlowRetainedContentTextureManager,
  type GpuRetainedContentSurfaceWithScene,
} from "./retainedContentControllerSurfaceUpdates";

export function applyGpuFlowRetainedContentRuntimeScrollOffsetChanges({
  containerRef,
  getNativeVisuals,
  nodeElementByIdRef,
  nodeLayerRef,
  previousScrollOffsets,
  retainedContentPageManagerRef,
  retainedContentRuntimeState,
  surfaceRef,
  switchAnimations,
  textureManagerRef,
  viewportStore,
}: {
  readonly containerRef: MutableRefObject<HTMLDivElement | null>;
  readonly getNativeVisuals: (
    scene: GpuFlowScene,
  ) => NonNullable<
    GpuFlowRetainedContentNodeLayerState["htmlSurfaceNativeVisuals"]
  >;
  readonly nodeElementByIdRef: MutableRefObject<Map<string, HTMLElement>>;
  readonly nodeLayerRef: MutableRefObject<GpuFlowRetainedContentNodeLayerState>;
  readonly previousScrollOffsets: ReadonlyMap<
    string,
    { readonly x: number; readonly y: number }
  >;
  readonly retainedContentPageManagerRef: MutableRefObject<GpuFlowRetainedContentPageManager | null>;
  readonly retainedContentRuntimeState: GpuRetainedContentRuntimeState;
  readonly surfaceRef: MutableRefObject<GpuSurfaceHandle | null>;
  readonly switchAnimations: GpuRetainedContentSwitchAnimationStore;
  readonly textureManagerRef: MutableRefObject<GpuFlowRetainedContentTextureManager | null>;
  readonly viewportStore: GpuFlowViewportStoreApi;
}): boolean {
  const scrollOffsets = getGpuRetainedContentRuntimeScrollOffsets(
    retainedContentRuntimeState,
  );
  let changed = false;
  for (const [surfaceId, scrollOffset] of scrollOffsets) {
    const previousScrollOffset = previousScrollOffsets.get(surfaceId);
    if (
      previousScrollOffset &&
      previousScrollOffset.x === scrollOffset.x &&
      previousScrollOffset.y === scrollOffset.y
    ) {
      continue;
    }
    applyGpuFlowRetainedContentScrollResult({
      containerRef,
      getNativeVisuals,
      nodeElementByIdRef,
      nodeLayerRef,
      retainedContentPageManagerRef,
      result: {
        scrollOffsets,
        surfaceId,
      },
      surfaceRef,
      switchAnimations,
      textureManagerRef,
      viewportStore,
    });
    changed = true;
  }
  return changed;
}

export function applyGpuFlowRetainedContentScrollResult({
  containerRef,
  getNativeVisuals,
  nodeElementByIdRef,
  nodeLayerRef,
  retainedContentPageManagerRef,
  result,
  scrollbarVisualState,
  surfaceRef,
  switchAnimations,
  textureManagerRef,
  viewportStore,
}: {
  readonly containerRef: MutableRefObject<HTMLDivElement | null>;
  readonly getNativeVisuals: (
    scene: GpuFlowScene,
  ) => NonNullable<
    GpuFlowRetainedContentNodeLayerState["htmlSurfaceNativeVisuals"]
  >;
  readonly nodeElementByIdRef: MutableRefObject<Map<string, HTMLElement>>;
  readonly nodeLayerRef: MutableRefObject<GpuFlowRetainedContentNodeLayerState>;
  readonly retainedContentPageManagerRef: MutableRefObject<GpuFlowRetainedContentPageManager | null>;
  readonly result: {
    readonly scrollOffsets: ReadonlyMap<
      string,
      { readonly x: number; readonly y: number }
    >;
    readonly surfaceId: string | null;
  };
  readonly scrollbarVisualState?:
    | GpuRetainedContentScrollbarVisualState
    | undefined;
  readonly surfaceRef: MutableRefObject<GpuSurfaceHandle | null>;
  readonly switchAnimations: GpuRetainedContentSwitchAnimationStore;
  readonly textureManagerRef: MutableRefObject<GpuFlowRetainedContentTextureManager | null>;
  readonly viewportStore: GpuFlowViewportStoreApi;
}) {
  const surfaceId = result.surfaceId;
  const scene = nodeLayerRef.current.scene;
  if (!surfaceId || !scene) {
    return;
  }
  const scrollOffset = result.scrollOffsets.get(surfaceId);
  if (!scrollOffset) {
    return;
  }
  const update = applyGpuRetainedContentScrollOffsetToScene({
    scene,
    scrollOffset,
    surfaceId,
  });
  if (!update) {
    return;
  }
  let nextScene = update.scene;
  const surfacesToRedraw = new Map<
    string,
    GpuRetainedContentSurfaceWithScene
  >();
  surfacesToRedraw.set(update.surface.id, update.surface);
  if (scrollbarVisualState) {
    const scrollbarVisualUpdate =
      applyGpuRetainedContentScrollbarVisualStateToScene({
        scene: nextScene,
        visualState: scrollbarVisualState,
      });
    if (scrollbarVisualUpdate) {
      nextScene = scrollbarVisualUpdate.scene;
    }
  }
  syncGpuFlowRetainedContentDomIslandElements({
    container: containerRef.current,
    nextScene,
    previousScene: scene,
    surfaceId,
    viewport: viewportStore.getState().transform,
  });
  nodeLayerRef.current = {
    ...nodeLayerRef.current,
    edgeLabelSurfaces: mergeGpuFlowRetainedContentSurfaceLayouts({
      overlays: nodeLayerRef.current.edgeLabelSurfaces,
      scene: nextScene,
    }),
    htmlSurfaceNativeVisuals: getNativeVisuals(nextScene),
    scene: nextScene,
  };
  redrawGpuFlowRetainedContentSurfaceSources({
    nodeElementByIdRef,
    retainedContentPageManagerRef,
    surfaceRef,
    surfaces: [...surfacesToRedraw.values()],
    switchAnimations,
    textureManagerRef,
  });
  surfaceRef.current?.requestFrame("manual");
}

function syncGpuFlowRetainedContentDomIslandElements({
  container,
  nextScene,
  previousScene,
  surfaceId,
  viewport,
}: {
  readonly container: HTMLElement | null;
  readonly nextScene: GpuFlowScene;
  readonly previousScene: GpuFlowScene;
  readonly surfaceId: string;
  readonly viewport: GpuViewportInput;
}) {
  if (!container) {
    return;
  }
  const previousIslands = previousScene.domIslands.filter((island) =>
    isGpuFlowRetainedContentDomIslandForSurface(island, surfaceId),
  );
  if (previousIslands.length === 0) {
    return;
  }
  const nextIslandById = new Map(
    nextScene.domIslands.map((island) => [island.id, island]),
  );
  const islandElements = [
    ...container.querySelectorAll<HTMLElement>("[data-gpu-flow-dom-island-id]"),
  ];
  for (const previousIsland of previousIslands) {
    const element = islandElements.find(
      (candidate) =>
        candidate.getAttribute("data-gpu-flow-dom-island-id") ===
        previousIsland.id,
    );
    if (!element) {
      continue;
    }
    const nextIsland = nextIslandById.get(previousIsland.id);
    if (!nextIsland) {
      hideGpuFlowDomIslandElement(element);
      continue;
    }
    syncGpuFlowDomIslandElementStyle({
      element,
      island: nextIsland,
      viewport,
    });
  }
}

function isGpuFlowRetainedContentDomIslandForSurface(
  island: GpuDomIsland,
  surfaceId: string,
): boolean {
  return (
    island.source.kind === "retained-content" &&
    island.source.surfaceId === surfaceId
  );
}

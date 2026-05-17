import { getGpuRetainedDomControlSourcesFromHitTestSurfaces } from "./GpuFlow/retainedDomControlSources";
import { getGpuRetainedContentTexturePageFrameSurfacesFromSourceSurfaces } from "./GpuRetainedContentPageFrameSurfaces";
import { getGpuRetainedContentScrollbarVisualsFromSourceSurfaces } from "./GpuRetainedContentScrollbarVisuals";
import {
  getGpuRetainedContentSourceSurfaces,
  type GpuRetainedContentSourceSurface,
  type GpuRetainedContentSurface,
} from "./GpuRetainedContentSurfaces";
import type { HtmlSurfaceSolidRoundedRectVisual } from "./htmlSurfaces/visualScene";
import {
  getGpuRetainedContentRowHoverStateVisuals,
  getGpuRetainedContentRowHoverVisuals,
  type GpuRetainedContentRowHoverTarget,
} from "./retainedContentRowHover";
import { createGpuRetainedContentSampledSceneForSurface } from "./retainedContentRuntimeSampling";
import type { GpuRetainedContentScrollOffsetMap } from "./retainedContentScroll";
import type { GpuRetainedContentScrollbarVisualState } from "./retainedContentScrollbar";
import type { RetainedContentTexturePageFrameSurface } from "./retainedContentTexturePageManager";
import { GPU_RETAINED_DOM_CONTROL_PROJECTION_HORIZON_CSS_PX } from "./retainedDomControlGeometry";
import type { GpuRetainedDomControlSourceDescriptor } from "./retainedDomControlScene";
import type { GpuDomIsland, GpuFlowScene } from "./scene";
import type { GpuRect, GpuViewportInput } from "./viewportMath";

type GpuRetainedRuntimeFrameInputSnapshot = {
  readonly activeNativeIslandIds: readonly string[];
  readonly devicePixelRatioBucket: number;
  readonly sceneRevision: number;
  readonly scrollOffsets: GpuRetainedContentScrollOffsetMap;
  readonly scrollRevision: number;
  readonly scrollRevisions: ReadonlyMap<string, number>;
  readonly viewport: GpuViewportInput;
  readonly viewportSize: {
    readonly height: number;
    readonly width: number;
  } | null;
  readonly viewportZoomBucket: number;
};

type GpuRetainedRuntimeFrameDescriptors = {
  readonly contentPageSurfaces: readonly RetainedContentTexturePageFrameSurface[];
  readonly hitTestSurfaces: readonly GpuRetainedContentSurface[];
  readonly htmlSurfaceNativeVisuals: readonly HtmlSurfaceSolidRoundedRectVisual[];
  readonly nativeDomIslands: readonly GpuDomIsland[];
  readonly sourceSurfaces: readonly GpuRetainedContentSourceSurface[];
  readonly domControlSources: readonly GpuRetainedDomControlSourceDescriptor[];
};

type GpuRetainedRuntimeFrameDiagnostics = {
  readonly activeNativeIslandCount: number;
  readonly domControlSourceCount: number;
  readonly sourceSurfaceCount: number;
  readonly visibleRetainedSectionIds: readonly string[];
};

export type GpuRetainedRuntimeFrame = {
  readonly descriptors: GpuRetainedRuntimeFrameDescriptors;
  readonly diagnostics: GpuRetainedRuntimeFrameDiagnostics;
  readonly frameId: number;
  readonly input: GpuRetainedRuntimeFrameInputSnapshot;
};

type CreateGpuRetainedRuntimeFrameInput = {
  readonly devicePixelRatioBucket: number;
  readonly frameId: number;
  readonly scene: GpuFlowScene | undefined;
  readonly scrollbarVisualState?:
    | GpuRetainedContentScrollbarVisualState
    | undefined;
  readonly scrollOffsets: GpuRetainedContentScrollOffsetMap;
  readonly scrollRevision: number;
  readonly scrollRevisions?: ReadonlyMap<string, number> | undefined;
  readonly rowHoverTarget?: GpuRetainedContentRowHoverTarget | null | undefined;
  readonly viewport: GpuViewportInput;
  readonly viewportSize?:
    | { readonly height: number; readonly width: number }
    | undefined;
  readonly viewportZoomBucket: number;
};

export function createGpuRetainedRuntimeFrame({
  devicePixelRatioBucket,
  frameId,
  scene,
  scrollbarVisualState,
  scrollOffsets,
  scrollRevision,
  scrollRevisions,
  rowHoverTarget = null,
  viewport,
  viewportSize,
  viewportZoomBucket,
}: CreateGpuRetainedRuntimeFrameInput): GpuRetainedRuntimeFrame {
  const sourceSurfaces = freezeArray(
    getGpuRetainedContentSourceSurfaces(scene?.contentSurfaces, {
      scrollOffsets,
      viewportZoomBucket,
    }),
  );
  const contentPageSurfaces = freezeArray(
    getGpuRetainedContentTexturePageFrameSurfacesFromSourceSurfaces(
      sourceSurfaces,
      {
        viewportZoomBucket,
      },
    ),
  );
  const hitTestSurfaces = freezeArray(
    createGpuRetainedRuntimeFrameHitTestSurfaces({
      scene,
      scrollOffsets,
    }),
  );
  const domControlSources = freezeArray(
    getGpuRetainedDomControlSourcesFromHitTestSurfaces(hitTestSurfaces, {
      devicePixelRatioBucket,
      scrollRevision,
      scrollRevisions,
      viewport,
      viewportSize,
      viewportZoomBucket,
    }),
  );
  const nativeDomIslands = freezeArray(
    createGpuRetainedRuntimeFrameNativeDomIslands({
      hitTestSurfaces,
      scene,
    }),
  );
  const htmlSurfaceNativeVisuals = freezeArray(
    scene
      ? [
          ...getGpuRetainedContentScrollbarVisualsFromSourceSurfaces(
            sourceSurfaces,
            {
              scrollOffsets,
              visualState: scrollbarVisualState,
            },
          ),
          ...(rowHoverTarget
            ? getGpuRetainedContentRowHoverVisuals({
                scene,
                scrollOffsets,
                target: rowHoverTarget,
              })
            : getGpuRetainedContentRowHoverStateVisuals({
                scene,
                scrollOffsets,
              })),
        ]
      : [],
  );
  const activeNativeIslandIds = nativeDomIslands.map((island) => island.id);
  return Object.freeze({
    descriptors: Object.freeze({
      contentPageSurfaces,
      hitTestSurfaces,
      htmlSurfaceNativeVisuals,
      nativeDomIslands,
      sourceSurfaces,
      domControlSources,
    }),
    diagnostics: Object.freeze({
      activeNativeIslandCount: nativeDomIslands.length,
      domControlSourceCount: domControlSources.length,
      sourceSurfaceCount: sourceSurfaces.length,
      visibleRetainedSectionIds: freezeArray(
        sourceSurfaces.map((surface) => surface.ownerSectionId),
      ),
    }),
    frameId,
    input: Object.freeze({
      activeNativeIslandIds: freezeArray(activeNativeIslandIds),
      devicePixelRatioBucket,
      sceneRevision: scene?.revision ?? 0,
      scrollOffsets: new Map(scrollOffsets),
      scrollRevision,
      scrollRevisions: new Map(scrollRevisions ?? []),
      viewport,
      viewportSize: viewportSize ? Object.freeze({ ...viewportSize }) : null,
      viewportZoomBucket,
    }),
  });
}

function createGpuRetainedRuntimeFrameHitTestSurfaces({
  scene,
  scrollOffsets,
}: {
  readonly scene: GpuFlowScene | undefined;
  readonly scrollOffsets: GpuRetainedContentScrollOffsetMap;
}): readonly GpuRetainedContentSurface[] {
  return (scene?.contentSurfaces ?? [])
    .map((surface, index) => ({ index, surface }))
    .filter(
      (
        entry,
      ): entry is {
        readonly index: number;
        readonly surface: GpuRetainedContentSurface;
      } => isGpuRetainedRuntimeFrameHitTestSurface(entry.surface),
    )
    .map(({ index, surface }) => ({
      index,
      surface: {
        ...surface,
        retainedScene: createGpuRetainedContentSampledSceneForSurface({
          minOverscanRows: Math.ceil(
            GPU_RETAINED_DOM_CONTROL_PROJECTION_HORIZON_CSS_PX /
              surface.retainedScene.rowHeight,
          ),
          scrollOffsets,
          surface,
        }),
      },
    }))
    .sort(
      (left, right) =>
        right.surface.zIndex - left.surface.zIndex || right.index - left.index,
    )
    .map((entry) => entry.surface);
}

function isGpuRetainedRuntimeFrameHitTestSurface(
  surface: GpuFlowScene["contentSurfaces"][number],
): surface is GpuRetainedContentSurface {
  return (
    surface.renderer.kind === "canvas-content" &&
    Boolean(surface.retainedScene) &&
    surface.rect.width > 0 &&
    surface.rect.height > 0 &&
    surface.clipRect.width > 0 &&
    surface.clipRect.height > 0
  );
}

function createGpuRetainedRuntimeFrameNativeDomIslands({
  hitTestSurfaces,
  scene,
}: {
  readonly hitTestSurfaces: readonly GpuRetainedContentSurface[];
  readonly scene: GpuFlowScene | undefined;
}): readonly GpuDomIsland[] {
  if (!scene?.domIslands.length) {
    return [];
  }
  return scene.domIslands.flatMap((island) => {
    const sampledIsland = sampleGpuRetainedRuntimeFrameDomIsland({
      hitTestSurfaces,
      island,
    });
    return sampledIsland ? [sampledIsland] : [];
  });
}

function sampleGpuRetainedRuntimeFrameDomIsland({
  hitTestSurfaces,
  island,
}: {
  readonly hitTestSurfaces: readonly GpuRetainedContentSurface[];
  readonly island: GpuDomIsland;
}): GpuDomIsland | null {
  const source = island.source;
  if (source.kind !== "retained-content") {
    return island;
  }
  const surface = hitTestSurfaces.find(
    (candidate) => candidate.id === source.surfaceId,
  );
  if (!surface) {
    return null;
  }
  const hit = surface.retainedScene.hitRecords.find(
    (candidate) =>
      candidate.id === source.hitRecordId &&
      candidate.ownerRowId === source.ownerRowId,
  );
  if (!hit) {
    return null;
  }
  const previousControlRect =
    getGpuRetainedRuntimeFrameDomIslandControlRect(island);
  const nextControlRect = translateGpuRetainedRuntimeFrameLocalRect(
    hit.rect,
    surface.rect,
  );
  const delta = {
    x: nextControlRect.x - previousControlRect.x,
    y: nextControlRect.y - previousControlRect.y,
  };
  const movedIslandRect = {
    ...island.rect,
    x: island.rect.x + delta.x,
    y: island.rect.y + delta.y,
  };
  const rect = intersectGpuRetainedRuntimeFrameRects(
    movedIslandRect,
    surface.clipRect,
  );
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }
  return {
    ...island,
    contentRect: {
      ...island.contentRect,
      x: nextControlRect.x - rect.x,
      y: nextControlRect.y - rect.y,
    },
    rect,
  };
}

function getGpuRetainedRuntimeFrameDomIslandControlRect(
  island: GpuDomIsland,
): GpuRect {
  return {
    height: island.contentRect.height,
    width: island.contentRect.width,
    x: island.rect.x + island.contentRect.x,
    y: island.rect.y + island.contentRect.y,
  };
}

function translateGpuRetainedRuntimeFrameLocalRect(
  localRect: GpuRect,
  parentRect: GpuRect,
): GpuRect {
  return {
    height: Math.min(localRect.height, parentRect.height),
    width: Math.min(localRect.width, parentRect.width),
    x: parentRect.x + localRect.x,
    y: parentRect.y + localRect.y,
  };
}

function intersectGpuRetainedRuntimeFrameRects(
  left: GpuRect,
  right: GpuRect,
): GpuRect {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const width = Math.max(
    0,
    Math.min(left.x + left.width, right.x + right.width) - x,
  );
  const height = Math.max(
    0,
    Math.min(left.y + left.height, right.y + right.height) - y,
  );
  return { height, width, x, y };
}

function freezeArray<T>(values: readonly T[]): readonly T[] {
  return Object.freeze([...values]);
}

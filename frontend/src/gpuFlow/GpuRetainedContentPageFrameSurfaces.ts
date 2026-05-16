import type { GpuRetainedTextLikeRowSnapshotSource } from "./GpuFlow/retainedTextLikeRowSnapshotSources";
import {
  getGpuRetainedContentSourceSurfaces,
  type GpuRetainedContentSourceSurface,
} from "./GpuRetainedContentSurfaces";
import {
  createGpuRetainedRowContentSceneWithScrollWindow,
  type GpuRetainedContentScene,
} from "./retainedContentScene";
import { getGpuRetainedContentSceneSourceInput } from "./retainedContentSceneSourceMetadata";
import type { GpuRetainedContentScrollOffsetMap } from "./retainedContentScroll";
import type {
  RetainedContentTexturePageContentSegment,
  RetainedContentTexturePageFrameSurface,
} from "./retainedContentTexturePageManager";
import type { RetainedContentTexturePageTextLikeSnapshot } from "./retainedContentTexturePageTextLikeSnapshots";
import type { GpuContentSurface } from "./scene";
import type { GpuRect } from "./viewportMath";

type GpuRetainedContentPageFrameSurfaceOptions = {
  readonly scrollOffsets?: GpuRetainedContentScrollOffsetMap | undefined;
  readonly textLikeRowSnapshotSources?:
    | readonly GpuRetainedTextLikeRowSnapshotSource[]
    | undefined;
  readonly viewportZoomBucket?: number | undefined;
};

const contentVersions = new Map<string, number>();
let nextContentVersion = 1;

export function getGpuRetainedContentTexturePageFrameSurfaces(
  surfaces: readonly GpuContentSurface[] | undefined,
  options: GpuRetainedContentPageFrameSurfaceOptions = {},
): readonly RetainedContentTexturePageFrameSurface[] {
  assertGpuRetainedContentPageFrameSurfaceSceneOnlyAccessAllowed();
  return getGpuRetainedContentTexturePageFrameSurfacesFromSourceSurfaces(
    getGpuRetainedContentSourceSurfaces(surfaces, options),
    options,
  );
}

function assertGpuRetainedContentPageFrameSurfaceSceneOnlyAccessAllowed() {
  if (typeof process !== "undefined" && process.env.NODE_ENV === "test") {
    return;
  }
  throw new Error(
    "Retained page frame surfaces must be read from a sampled retained runtime frame.",
  );
}

export function getGpuRetainedContentTexturePageFrameSurfacesFromSourceSurfaces(
  surfaces: readonly GpuRetainedContentSourceSurface[],
  options: GpuRetainedContentPageFrameSurfaceOptions = {},
): readonly RetainedContentTexturePageFrameSurface[] {
  return surfaces.map((surface) =>
    toGpuRetainedContentTexturePageFrameSurface(surface, options),
  );
}

function toGpuRetainedContentTexturePageFrameSurface(
  surface: GpuRetainedContentSourceSurface,
  options: GpuRetainedContentPageFrameSurfaceOptions,
): RetainedContentTexturePageFrameSurface {
  const textLikeSnapshots = createTextLikeSnapshots({
    sources: options.textLikeRowSnapshotSources ?? [],
    surfaceId: surface.id,
  });
  const contentVersion = getBaseContentVersion(surface.retainedScene);
  const sourceWindowCss = {
    height: surface.textureWindow.cacheViewportRect.height,
    width: surface.textureWindow.cacheViewportRect.width,
    x: surface.textureWindow.cacheScrollOffset.x,
    y: surface.textureWindow.cacheScrollOffset.y,
  };
  const visibleContentRectCss = toRetainedContentRectCss({
    rect: surface.textureWindow.sourceRect,
    viewportRect: surface.textureWindow.cacheViewportRect,
    windowOrigin: sourceWindowCss,
  });
  const sourceKey = createRetainedContentTexturePageFrameSurfaceSourceKey({
    contentVersion,
    surfaceId: surface.id,
  });
  return {
    contentBoundsCss: {
      height: Math.max(
        surface.retainedScene.contentRect.height,
        sourceWindowCss.y + surface.textureWindow.textureHeight,
      ),
      width: Math.max(
        surface.retainedScene.contentRect.width,
        sourceWindowCss.x + surface.textureWindow.textureWidth,
      ),
      x: 0,
      y: 0,
    },
    contentSegments: createContentSegments(surface.retainedScene),
    contentVersion,
    layout: {
      height: surface.rect.height,
      surfaceId: surface.id,
      textureSourceRect: visibleContentRectCss,
      width: surface.rect.width,
      x: surface.rect.x,
      y: surface.rect.y,
      zIndex: surface.zIndex,
    },
    rasterScene: createGpuRetainedRowContentSceneWithScrollWindow({
      scene: surface.retainedScene,
      scrollOffset: surface.textureWindow.cacheScrollOffset,
      viewportRect: surface.textureWindow.cacheViewportRect,
    }),
    sourceKey,
    sourceVersion: contentVersion,
    sourceWindowCss,
    surfaceId: surface.id,
    textLikeSnapshots,
    visibleSourceRectCss: visibleContentRectCss,
  };
}

function toRetainedContentRectCss({
  rect,
  viewportRect,
  windowOrigin,
}: {
  readonly rect: GpuRect;
  readonly viewportRect: GpuRect;
  readonly windowOrigin: { readonly x: number; readonly y: number };
}): GpuRect {
  return {
    height: rect.height,
    width: rect.width,
    x: rect.x - viewportRect.x + windowOrigin.x,
    y: rect.y - viewportRect.y + windowOrigin.y,
  };
}

function createRetainedContentTexturePageFrameSurfaceSourceKey({
  contentVersion,
  surfaceId,
}: {
  readonly contentVersion: number;
  readonly surfaceId: string;
}): string {
  return JSON.stringify({
    contentVersion,
    surfaceId,
  });
}

function createTextLikeSnapshots({
  sources,
  surfaceId,
}: {
  readonly sources: readonly GpuRetainedTextLikeRowSnapshotSource[];
  readonly surfaceId: string;
}): readonly RetainedContentTexturePageTextLikeSnapshot[] {
  return sources
    .filter((source) => source.surfaceId === surfaceId)
    .map((source) => ({
      rectCss: source.targetRectCss,
      rowId: source.rowId,
      sourceId: source.sourceId,
      sourceKey: source.sourceKey,
    }));
}

function getContentVersion(signature: string): number {
  const existingVersion = contentVersions.get(signature);
  if (existingVersion !== undefined) {
    return existingVersion;
  }
  const version = nextContentVersion;
  nextContentVersion += 1;
  contentVersions.set(signature, version);
  return version;
}

function getBaseContentVersion(scene: GpuRetainedContentScene): number {
  return getContentVersion(createBaseContentSignature(scene));
}

function getRowContentVersion(row: GpuRetainedContentSceneSourceRow): number {
  return getContentVersion(createRowContentSignature(row));
}

type GpuRetainedContentSceneSourceRow = NonNullable<
  ReturnType<typeof getGpuRetainedContentSceneSourceInput>
>["rows"][number];

function createContentSegments(
  scene: GpuRetainedContentScene,
): readonly RetainedContentTexturePageContentSegment[] {
  const sourceInput = getGpuRetainedContentSceneSourceInput(scene);
  if (!sourceInput) {
    return [];
  }
  return sourceInput.layout.rowMetrics.map((rowMetric) => ({
    contentVersion: getRowContentVersion(rowMetric.input),
    id: rowMetric.input.id,
    rectCss: createRowContentSegmentRect({
      rowHeight: rowMetric.height,
      rowVisualBounds: sourceInput.rowVisualBounds,
      y: rowMetric.y,
    }),
  }));
}

function createRowContentSegmentRect({
  rowHeight,
  rowVisualBounds,
  y,
}: {
  readonly rowHeight: number;
  readonly rowVisualBounds: {
    readonly width: number;
    readonly x: number;
  };
  readonly y: number;
}): GpuRect {
  return {
    height: rowHeight,
    width: rowVisualBounds.width,
    x: rowVisualBounds.x,
    y,
  };
}

function createBaseContentSignature(scene: GpuRetainedContentScene): string {
  const sourceInput = getGpuRetainedContentSceneSourceInput(scene);
  if (!sourceInput) {
    return JSON.stringify({
      contentRect: scene.contentRect,
      id: scene.id,
      ownerSectionId: scene.ownerSectionId,
      rowOrder: scene.rowOrder,
      viewportWidth: scene.viewportRect.width,
    });
  }
  return JSON.stringify({
    activePopup: sourceInput.activePopup,
    contentRect: sourceInput.layout.contentRect,
    controlRightInset: sourceInput.controlRightInset,
    controlWidth: sourceInput.controlWidth,
    dragPreview: sourceInput.dragPreview,
    id: sourceInput.id,
    indentWidth: sourceInput.indentWidth,
    labelControlGap: sourceInput.labelControlGap,
    ownerSectionId: sourceInput.ownerSectionId,
    portHitSize: sourceInput.portHitSize,
    rowHeight: sourceInput.rowHeight,
    rowOrder: sourceInput.layout.rowOrder,
    rowVisualBounds: sourceInput.rowVisualBounds,
    viewportWidth: sourceInput.viewportRect.width,
  });
}

function createRowContentSignature(
  row: GpuRetainedContentSceneSourceRow,
): string {
  return JSON.stringify({
    control: row.control,
    controlKind: row.controlKind,
    depth: row.depth,
    height: row.height,
    id: row.id,
    label: row.label,
    labelAppearance: row.labelAppearance,
    ports: row.ports,
    state: createRowContentSignatureState(row.state),
    status: row.status,
    verticalGapBefore: row.verticalGapBefore,
  });
}

function createRowContentSignatureState(
  state: GpuRetainedContentSceneSourceRow["state"],
): Omit<NonNullable<GpuRetainedContentSceneSourceRow["state"]>, "hovered"> {
  const contentState = { ...(state ?? {}) };
  delete contentState.hovered;
  return contentState;
}

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
import type { GpuContentSurface } from "./scene";
import {
  getVisibleFlowRect,
  type GpuRect,
  type GpuViewportInput,
} from "./viewportMath";

type GpuRetainedContentPageFrameSurfaceOptions = {
  readonly scrollOffsets?: GpuRetainedContentScrollOffsetMap | undefined;
  readonly viewport?: GpuViewportInput | undefined;
  readonly viewportSize?:
    | { readonly height: number; readonly width: number }
    | undefined;
  readonly viewportZoomBucket?: number | undefined;
};

const RETAINED_CONTENT_PAGE_FRAME_VIEWPORT_MARGIN_CSS_PX = 64;

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
  return surfaces
    .map((surface) =>
      toGpuRetainedContentTexturePageFrameSurface(surface, options),
    )
    .filter(
      (surface): surface is RetainedContentTexturePageFrameSurface =>
        Boolean(surface),
    );
}

function toGpuRetainedContentTexturePageFrameSurface(
  surface: GpuRetainedContentSourceSurface,
  options: GpuRetainedContentPageFrameSurfaceOptions,
): RetainedContentTexturePageFrameSurface | null {
  void options.viewportZoomBucket;
  const visibleFlowRect = resolveGpuRetainedContentPageFrameFlowRect({
    options,
    surface,
  });
  if (!visibleFlowRect) {
    return null;
  }
  const contentVersion = getBaseContentVersion(surface.retainedScene);
  const sourceWindowCss = {
    height: surface.textureWindow.cacheViewportRect.height,
    width: surface.textureWindow.cacheViewportRect.width,
    x: surface.textureWindow.cacheScrollOffset.x,
    y: surface.textureWindow.cacheScrollOffset.y,
  };
  const visibleTextureSourceRect = {
    height: visibleFlowRect.height,
    width: visibleFlowRect.width,
    x:
      surface.textureWindow.sourceRect.x +
      visibleFlowRect.x -
      surface.rect.x,
    y:
      surface.textureWindow.sourceRect.y +
      visibleFlowRect.y -
      surface.rect.y,
  };
  const visibleContentRectCss = toRetainedContentRectCss({
    rect: visibleTextureSourceRect,
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
      height: visibleFlowRect.height,
      surfaceId: surface.id,
      textureSourceRect: visibleContentRectCss,
      width: visibleFlowRect.width,
      x: visibleFlowRect.x,
      y: visibleFlowRect.y,
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
    visibleSourceRectCss: visibleContentRectCss,
  };
}

function resolveGpuRetainedContentPageFrameFlowRect({
  options,
  surface,
}: {
  readonly options: GpuRetainedContentPageFrameSurfaceOptions;
  readonly surface: GpuRetainedContentSourceSurface;
}): GpuRect | null {
  if (!options.viewport || !options.viewportSize) {
    return surface.rect;
  }
  const viewportFlowRect = getVisibleFlowRect({
    canvasHeight: options.viewportSize.height,
    canvasWidth: options.viewportSize.width,
    marginCssPx: RETAINED_CONTENT_PAGE_FRAME_VIEWPORT_MARGIN_CSS_PX,
    viewport: options.viewport,
  });
  const visibleRect = intersectRetainedPageFrameRects(
    surface.rect,
    viewportFlowRect,
  );
  return visibleRect.width > 0 && visibleRect.height > 0 ? visibleRect : null;
}

function intersectRetainedPageFrameRects(left: GpuRect, right: GpuRect): GpuRect {
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

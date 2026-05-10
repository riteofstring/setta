import type { GpuRetainedContentScene } from "./retainedContentScene";
import { getGpuRetainedContentSceneSourceInput } from "./retainedContentSceneSourceMetadata";
import type { GpuContentSurface } from "./scene";
import type { GpuPoint, GpuRect } from "./viewportMath";

export type GpuRetainedContentSurface = GpuContentSurface & {
  readonly retainedScene: GpuRetainedContentScene;
};

export type GpuRetainedContentSourceSurface = GpuRetainedContentSurface & {
  readonly sourceClipOffset: GpuPoint;
  readonly textureWindow: GpuRetainedContentTextureWindow;
};

type GpuRetainedContentTextureWindow = {
  readonly cacheScrollOffset: GpuPoint;
  readonly cacheViewportRect: GpuRect;
  readonly sourceRect: GpuRect;
  readonly textureHeight: number;
  readonly textureWidth: number;
};

type GpuRetainedContentSourceSurfaceOptions = {
  readonly viewportZoomBucket?: number | undefined;
};

export function getGpuRetainedContentSourceIdsForSurface(
  surface: GpuContentSurface,
): readonly string[] {
  return getGpuRetainedContentSourceSurfaces([surface]).map(
    (source) => source.id,
  );
}

export function getGpuRetainedContentSourceRectForRows({
  rowIds,
  surface,
}: {
  readonly rowIds: Iterable<string>;
  readonly surface: GpuRetainedContentSurface;
}): GpuRect | null {
  const rowIdSet = new Set(rowIds);
  if (rowIdSet.size === 0) {
    return null;
  }
  const sourceSurface = clipGpuRetainedContentSourceSurface(surface);
  const sourceInput = getGpuRetainedContentSceneSourceInput(
    surface.retainedScene,
  );
  if (!sourceSurface || !sourceInput) {
    return null;
  }
  const textureBounds: GpuRect = {
    height: sourceSurface.textureWindow.textureHeight,
    width: sourceSurface.textureWindow.textureWidth,
    x: 0,
    y: 0,
  };
  let dirtyRect: GpuRect | null = null;
  for (const rowMetric of sourceInput.layout.rowMetrics) {
    if (!rowIdSet.has(rowMetric.input.id)) {
      continue;
    }
    const clippedRowRect = intersectGpuRetainedContentRects(
      {
        height: rowMetric.height,
        width: sourceInput.rowVisualBounds.width,
        x:
          sourceSurface.textureWindow.cacheViewportRect.x -
          sourceSurface.textureWindow.cacheScrollOffset.x +
          sourceInput.rowVisualBounds.x,
        y:
          sourceSurface.textureWindow.cacheViewportRect.y +
          rowMetric.y -
          sourceSurface.textureWindow.cacheScrollOffset.y,
      },
      textureBounds,
    );
    if (clippedRowRect.width <= 0 || clippedRowRect.height <= 0) {
      continue;
    }
    dirtyRect = dirtyRect
      ? unionGpuRetainedContentRects(dirtyRect, clippedRowRect)
      : clippedRowRect;
  }
  return dirtyRect;
}

export function getGpuRetainedContentSourceSurfaces(
  surfaces: readonly GpuContentSurface[] | undefined,
  options: GpuRetainedContentSourceSurfaceOptions = {},
): readonly GpuRetainedContentSourceSurface[] {
  void options.viewportZoomBucket;
  return (surfaces ?? [])
    .filter(isGpuRetainedContentSurface)
    .map(clipGpuRetainedContentSourceSurface)
    .filter((surface): surface is GpuRetainedContentSourceSurface =>
      Boolean(surface),
    );
}

export function clipGpuRetainedContentSourceSurface(
  surface: GpuRetainedContentSurface,
): GpuRetainedContentSourceSurface | null {
  const rect = intersectGpuRetainedContentRects(surface.rect, surface.clipRect);
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }
  const previousOffset =
    "sourceClipOffset" in surface
      ? (surface.sourceClipOffset as GpuPoint)
      : { x: 0, y: 0 };
  const sourceClipOffset = {
    x: previousOffset.x + rect.x - surface.rect.x,
    y: previousOffset.y + rect.y - surface.rect.y,
  };
  return {
    ...surface,
    rect,
    sourceClipOffset,
    textureWindow: resolveGpuRetainedContentTextureWindow({
      rect,
      scene: surface.retainedScene,
      sourceClipOffset,
    }),
  };
}

function isGpuRetainedContentSurface(
  surface: GpuContentSurface,
): surface is GpuRetainedContentSurface {
  return (
    surface.renderer.kind === "canvas-content" &&
    Boolean(surface.retainedScene) &&
    surface.rect.width > 0 &&
    surface.rect.height > 0
  );
}

function resolveGpuRetainedContentTextureWindow({
  rect,
  scene,
  sourceClipOffset,
}: {
  readonly rect: GpuRect;
  readonly scene: GpuRetainedContentScene;
  readonly sourceClipOffset: GpuPoint;
}): GpuRetainedContentTextureWindow {
  const viewportHeight = Math.max(1, scene.viewportRect.height);
  const contentHeight = Math.max(viewportHeight, scene.contentRect.height);
  const cacheHeight = resolveGpuRetainedContentTextureCacheHeight({
    contentHeight,
    rowHeight: scene.rowHeight,
    viewportHeight,
  });
  const maxScrollY = Math.max(0, contentHeight - viewportHeight);
  const scrollY = clampGpuRetainedContentNumber(
    scene.scrollOffset.y,
    0,
    maxScrollY,
  );
  const maxCacheTop = Math.max(0, contentHeight - cacheHeight);
  const cacheStride = Math.max(1, cacheHeight - viewportHeight);
  const cacheTop = clampGpuRetainedContentNumber(
    Math.floor(scrollY / cacheStride) * cacheStride,
    0,
    maxCacheTop,
  );
  const sourceRect = {
    height: rect.height,
    width: rect.width,
    x: sourceClipOffset.x,
    y: sourceClipOffset.y + scrollY - cacheTop,
  };
  const sourceInput = getGpuRetainedContentSceneSourceInput(scene);
  const rowVisualRight = sourceInput
    ? sourceInput.rowVisualBounds.x + sourceInput.rowVisualBounds.width
    : scene.viewportRect.width;
  const textureHeight = Math.max(
    sourceRect.y + sourceRect.height,
    Math.min(contentHeight - cacheTop + sourceClipOffset.y, cacheHeight),
  );
  const textureWidth = Math.max(
    sourceRect.x + sourceRect.width,
    scene.viewportRect.width,
    rowVisualRight,
  );
  return {
    cacheScrollOffset: {
      x: scene.scrollOffset.x,
      y: cacheTop,
    },
    cacheViewportRect: {
      ...scene.viewportRect,
      height: textureHeight,
    },
    sourceRect,
    textureHeight,
    textureWidth,
  };
}

function resolveGpuRetainedContentTextureCacheHeight({
  contentHeight,
  rowHeight,
  viewportHeight,
}: {
  readonly contentHeight: number;
  readonly rowHeight: number;
  readonly viewportHeight: number;
}): number {
  if (contentHeight <= viewportHeight) {
    return viewportHeight;
  }
  return Math.min(
    contentHeight,
    Math.max(viewportHeight * 6, viewportHeight + rowHeight * 48),
  );
}

function clampGpuRetainedContentNumber(
  value: number,
  min: number,
  max: number,
): number {
  return Math.min(max, Math.max(min, value));
}

function intersectGpuRetainedContentRects(
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

function unionGpuRetainedContentRects(left: GpuRect, right: GpuRect): GpuRect {
  const x = Math.min(left.x, right.x);
  const y = Math.min(left.y, right.y);
  const maxX = Math.max(left.x + left.width, right.x + right.width);
  const maxY = Math.max(left.y + left.height, right.y + right.height);
  return {
    height: maxY - y,
    width: maxX - x,
    x,
    y,
  };
}

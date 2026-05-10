import type { GpuRetainedTextLikeRowSnapshotSource } from "./GpuFlow/retainedTextLikeRowSnapshotSources";
import type { CommittedHtmlSurfaceTextureSnapshot } from "./htmlSurfaces/textures";
import type { HtmlSurfaceFlatVisual } from "./htmlSurfaces/visualScene";
import type { RetainedTexturePageSurfaceLayout } from "./retainedTexturePageVisuals";
import type { GpuRect } from "./viewportMath";

export type RetainedTextLikeRowTextureFrameSurface = {
  readonly layout: RetainedTexturePageSurfaceLayout;
  readonly surfaceId: string;
};

export function createRetainedTextLikeRowTextureFlatVisual({
  source,
  surface,
  texture,
}: {
  readonly source: GpuRetainedTextLikeRowSnapshotSource;
  readonly surface: RetainedTextLikeRowTextureFrameSurface;
  readonly texture: CommittedHtmlSurfaceTextureSnapshot;
}): HtmlSurfaceFlatVisual | null {
  const visibleSourceRect = getRetainedTextLikeRowTextureVisibleSourceRect(
    source,
    surface,
  );
  if (!visibleSourceRect) {
    return null;
  }
  return {
    ...toFlowRect(surface.layout, visibleSourceRect),
    kind: "flat",
    surfaceId: source.sourceId,
    texture,
    textureCoordinates: toRowTextureCoordinates(source, visibleSourceRect),
    zIndex: surface.layout.zIndex ?? 0,
  };
}

export function getRetainedTextLikeRowTextureVisibleSourceRect(
  source: GpuRetainedTextLikeRowSnapshotSource,
  surface: RetainedTextLikeRowTextureFrameSurface,
): GpuRect | null {
  return intersectRects(source.targetRectCss, surface.layout.textureSourceRect);
}

function toFlowRect(
  layout: RetainedTexturePageSurfaceLayout,
  sourceRectCss: GpuRect,
): GpuRect {
  const scaleX = layout.width / layout.textureSourceRect.width;
  const scaleY = layout.height / layout.textureSourceRect.height;
  return {
    height: sourceRectCss.height * scaleY,
    width: sourceRectCss.width * scaleX,
    x: layout.x + (sourceRectCss.x - layout.textureSourceRect.x) * scaleX,
    y: layout.y + (sourceRectCss.y - layout.textureSourceRect.y) * scaleY,
  };
}

function toRowTextureCoordinates(
  source: GpuRetainedTextLikeRowSnapshotSource,
  visibleSourceRect: GpuRect,
) {
  return {
    u0: clampUnit(
      (visibleSourceRect.x - source.targetRectCss.x) / source.sourceWidth,
    ),
    u1: clampUnit(
      (visibleSourceRect.x + visibleSourceRect.width - source.targetRectCss.x) /
        source.sourceWidth,
    ),
    v0: clampUnit(
      (visibleSourceRect.y - source.targetRectCss.y) / source.sourceHeight,
    ),
    v1: clampUnit(
      (visibleSourceRect.y +
        visibleSourceRect.height -
        source.targetRectCss.y) /
        source.sourceHeight,
    ),
  };
}

function intersectRects(left: GpuRect, right: GpuRect): GpuRect | null {
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
  return width > 0 && height > 0 ? { height, width, x, y } : null;
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

import type { CommittedHtmlSurfaceTextureSnapshot } from "./htmlSurfaces/textures";
import type { HtmlSurfaceFlatVisual } from "./htmlSurfaces/visualScene";
import {
  getRetainedContentTextureResourceRegion,
  type RetainedContentTextureResources,
} from "./retainedContentTextureResources";
import type { RetainedTexturePageDrawQuad } from "./retainedTexturePageGrid";
import type { CommittedRetainedTexturePage } from "./retainedTexturePages";
import type { GpuRect } from "./viewportMath";

export type RetainedTexturePageSurfaceLayout = {
  readonly height: number;
  readonly surfaceId: string;
  readonly textureSourceRect: GpuRect;
  readonly width: number;
  readonly x: number;
  readonly y: number;
  readonly zIndex?: number | undefined;
};

export function createRetainedTexturePageFlatVisuals({
  drawQuads,
  layout,
}: {
  readonly drawQuads: readonly RetainedTexturePageDrawQuad<RetainedContentTextureResources>[];
  readonly layout: RetainedTexturePageSurfaceLayout;
}): readonly HtmlSurfaceFlatVisual[] {
  const visuals: HtmlSurfaceFlatVisual[] = [];
  for (const drawQuad of drawQuads) {
    const visibleSampleRect = intersectRects(
      drawQuad.sampleRectCss,
      layout.textureSourceRect,
    );
    if (!visibleSampleRect) {
      continue;
    }
    visuals.push({
      ...toFlowRect(layout, visibleSampleRect),
      kind: "flat",
      surfaceId: drawQuad.page.key,
      texture: toCommittedHtmlSurfaceTextureSnapshot(drawQuad.page),
      textureCoordinates: toPageTextureCoordinates(
        drawQuad.page,
        visibleSampleRect,
      ),
      zIndex: layout.zIndex ?? 0,
    });
  }
  return visuals;
}

function toFlowRect(
  layout: RetainedTexturePageSurfaceLayout,
  sampleRectCss: GpuRect,
): GpuRect {
  const scaleX = layout.width / layout.textureSourceRect.width;
  const scaleY = layout.height / layout.textureSourceRect.height;
  return {
    height: sampleRectCss.height * scaleY,
    width: sampleRectCss.width * scaleX,
    x: layout.x + (sampleRectCss.x - layout.textureSourceRect.x) * scaleX,
    y: layout.y + (sampleRectCss.y - layout.textureSourceRect.y) * scaleY,
  };
}

function toPageTextureCoordinates(
  page: CommittedRetainedTexturePage<RetainedContentTextureResources>,
  sampleRectCss: GpuRect,
) {
  const sourceRect = page.descriptor.sourceRectCss;
  const region = getRetainedContentTextureResourceRegion(page.resource);
  const x0 =
    region.x +
    ((sampleRectCss.x - sourceRect.x) / sourceRect.width) * region.pixelWidth;
  const x1 =
    region.x +
    ((sampleRectCss.x + sampleRectCss.width - sourceRect.x) /
      sourceRect.width) *
      region.pixelWidth;
  const y0 =
    region.y +
    ((sampleRectCss.y - sourceRect.y) / sourceRect.height) * region.pixelHeight;
  const y1 =
    region.y +
    ((sampleRectCss.y + sampleRectCss.height - sourceRect.y) /
      sourceRect.height) *
      region.pixelHeight;
  if (isAtlasTextureRegion(region)) {
    return {
      u0: clampUnit(x0 / region.texturePixelWidth),
      u1: clampUnit(x1 / region.texturePixelWidth),
      v0: clampUnit(y0 / region.texturePixelHeight),
      v1: clampUnit(y1 / region.texturePixelHeight),
    };
  }
  return {
    u0: clampUnit((sampleRectCss.x - sourceRect.x) / sourceRect.width),
    u1: clampUnit(
      (sampleRectCss.x + sampleRectCss.width - sourceRect.x) / sourceRect.width,
    ),
    v0: clampUnit((sampleRectCss.y - sourceRect.y) / sourceRect.height),
    v1: clampUnit(
      (sampleRectCss.y + sampleRectCss.height - sourceRect.y) /
        sourceRect.height,
    ),
  };
}

function toCommittedHtmlSurfaceTextureSnapshot(
  page: CommittedRetainedTexturePage<RetainedContentTextureResources>,
): CommittedHtmlSurfaceTextureSnapshot {
  const descriptor = page.descriptor;
  const region = getRetainedContentTextureResourceRegion(page.resource);
  return {
    clampedByMaxTexture: false,
    cssHeight: descriptor.sourceRectCss.height,
    cssWidth: descriptor.sourceRectCss.width,
    dirtyContent: false,
    dirtyResolution: false,
    lastUploadFrame: page.committedFrame,
    lastVisibleFrame: page.lastUsedFrame,
    maxTextureDimension2D: Math.max(
      descriptor.pixelHeight,
      descriptor.pixelWidth,
    ),
    pixelHeight: descriptor.pixelHeight,
    pixelWidth: descriptor.pixelWidth,
    priority: "visible",
    requestedScale: descriptor.lodScale,
    resolutionScale: descriptor.lodScale,
    sampler: page.resource.sampler,
    surfaceId: page.key,
    texture: page.resource.texture,
    textureBytes: page.byteSize,
    textureContentKey: region.atlasId,
    textureLayout: { kind: "single", tileCount: 1 },
    textureView: page.resource.textureView,
    tiles: [],
    zoomBucket: descriptor.lodScale,
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

function isAtlasTextureRegion(
  region: ReturnType<typeof getRetainedContentTextureResourceRegion>,
): boolean {
  return (
    region.x !== 0 ||
    region.y !== 0 ||
    region.texturePixelWidth !== region.pixelWidth ||
    region.texturePixelHeight !== region.pixelHeight
  );
}

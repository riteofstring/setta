import {
  RetainedTexturePageCache,
  type CommittedRetainedTexturePage,
  type RetainedTexturePageDescriptor,
} from "./retainedTexturePages";
import type { GpuRect } from "./viewportMath";

const PAGE_GRID_EDGE_EPSILON = 1e-6;

export type RetainedTexturePageGridInput = {
  readonly contentBoundsCss: GpuRect;
  readonly contentVersion: number;
  readonly lodScale: number;
  readonly maxPagePixelSize: number;
  readonly surfaceId: string;
  readonly visibleSourceRectCss: GpuRect;
};

export type RetainedTexturePageDrawQuad<TResource = unknown> = {
  readonly desiredDescriptor: RetainedTexturePageDescriptor;
  readonly page: CommittedRetainedTexturePage<TResource>;
  readonly sampleRectCss: GpuRect;
};

export function createRetainedTexturePageDescriptors({
  contentBoundsCss,
  contentVersion,
  lodScale,
  maxPagePixelSize,
  surfaceId,
  visibleSourceRectCss,
}: RetainedTexturePageGridInput): readonly RetainedTexturePageDescriptor[] {
  const normalizedContentBounds = normalizeRect(
    "contentBoundsCss",
    contentBoundsCss,
  );
  const normalizedVisibleRect = normalizeRect(
    "visibleSourceRectCss",
    visibleSourceRectCss,
  );
  const visibleRect = intersectRects(
    normalizedVisibleRect,
    normalizedContentBounds,
  );
  if (!visibleRect) {
    return [];
  }

  const normalizedLodScale = normalizeFinitePositiveNumber(
    "lodScale",
    lodScale,
  );
  const normalizedMaxPagePixelSize = normalizeFinitePositiveInteger(
    "maxPagePixelSize",
    maxPagePixelSize,
  );
  const pageCssSize = normalizedMaxPagePixelSize / normalizedLodScale;
  const minColumn = Math.floor(
    (visibleRect.x - normalizedContentBounds.x) / pageCssSize,
  );
  const maxColumn = Math.floor(
    (visibleRect.x +
      Math.max(0, visibleRect.width - PAGE_GRID_EDGE_EPSILON) -
      normalizedContentBounds.x) /
      pageCssSize,
  );
  const minRow = Math.floor(
    (visibleRect.y - normalizedContentBounds.y) / pageCssSize,
  );
  const maxRow = Math.floor(
    (visibleRect.y +
      Math.max(0, visibleRect.height - PAGE_GRID_EDGE_EPSILON) -
      normalizedContentBounds.y) /
      pageCssSize,
  );
  const descriptors: RetainedTexturePageDescriptor[] = [];
  for (let row = minRow; row <= maxRow; row += 1) {
    for (let column = minColumn; column <= maxColumn; column += 1) {
      const pageRect = intersectRects(
        {
          height: pageCssSize,
          width: pageCssSize,
          x: normalizedContentBounds.x + column * pageCssSize,
          y: normalizedContentBounds.y + row * pageCssSize,
        },
        normalizedContentBounds,
      );
      if (!pageRect) {
        continue;
      }
      descriptors.push({
        contentVersion,
        lodScale: normalizedLodScale,
        pixelHeight: Math.max(
          1,
          Math.ceil(pageRect.height * normalizedLodScale),
        ),
        pixelWidth: Math.max(1, Math.ceil(pageRect.width * normalizedLodScale)),
        sourceRectCss: pageRect,
        surfaceId,
        tileColumn: column,
        tileRow: row,
      });
    }
  }
  return descriptors;
}

export function createRetainedTexturePageDrawQuads<TResource>({
  cache,
  desiredPages,
  usedFrame,
}: {
  readonly cache: RetainedTexturePageCache<TResource>;
  readonly desiredPages: readonly RetainedTexturePageDescriptor[];
  readonly usedFrame?: number | undefined;
}): readonly RetainedTexturePageDrawQuad<TResource>[] {
  const quads: RetainedTexturePageDrawQuad<TResource>[] = [];
  for (const desiredDescriptor of desiredPages) {
    const page = cache.getBestCommittedPage({
      contentVersion: desiredDescriptor.contentVersion,
      sourceRectCss: desiredDescriptor.sourceRectCss,
      surfaceId: desiredDescriptor.surfaceId,
      targetLodScale: desiredDescriptor.lodScale,
      ...(usedFrame === undefined ? {} : { usedFrame }),
    });
    if (!page) {
      continue;
    }
    quads.push({
      desiredDescriptor,
      page,
      sampleRectCss: desiredDescriptor.sourceRectCss,
    });
  }
  return quads;
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

function normalizeRect(name: string, rect: GpuRect): GpuRect {
  const x = normalizeFiniteNumber(`${name}.x`, rect.x);
  const y = normalizeFiniteNumber(`${name}.y`, rect.y);
  const width = normalizeFinitePositiveNumber(`${name}.width`, rect.width);
  const height = normalizeFinitePositiveNumber(`${name}.height`, rect.height);
  return { height, width, x, y };
}

function normalizeFiniteNumber(name: string, value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error(`Retained texture page grid ${name} must be finite.`);
  }
  return value;
}

function normalizeFinitePositiveNumber(name: string, value: number): number {
  const normalized = normalizeFiniteNumber(name, value);
  if (normalized <= 0) {
    throw new Error(
      `Retained texture page grid ${name} must be greater than zero.`,
    );
  }
  return normalized;
}

function normalizeFinitePositiveInteger(name: string, value: number): number {
  const normalized = normalizeFinitePositiveNumber(name, value);
  if (!Number.isInteger(normalized)) {
    throw new Error(`Retained texture page grid ${name} must be an integer.`);
  }
  return normalized;
}

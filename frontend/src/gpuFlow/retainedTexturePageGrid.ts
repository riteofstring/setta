import {
  RetainedTexturePageCache,
  retainedTexturePageKey,
  retainedTexturePageLodLevel,
  retainedTexturePageScaleKey,
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
  readonly sourceWindowCss: GpuRect;
  readonly surfaceId: string;
  readonly visibleSourceRectCss: GpuRect;
};

export type RetainedTexturePageDrawQuad<TResource = unknown> = {
  readonly desiredDescriptor: RetainedTexturePageDescriptor;
  readonly page: CommittedRetainedTexturePage<TResource>;
  readonly sampleRectCss: GpuRect;
};

export type RetainedTexturePageCoverage<TResource = unknown> = {
  readonly drawQuads: readonly RetainedTexturePageDrawQuad<TResource>[];
  readonly protectedPageKeys: readonly string[];
  readonly refinementDescriptors: readonly RetainedTexturePageDescriptor[];
  readonly targetDescriptors: readonly RetainedTexturePageDescriptor[];
  readonly uncoveredRectsCss: readonly GpuRect[];
};

export function createRetainedTexturePageDescriptors({
  contentBoundsCss,
  contentVersion,
  lodScale,
  maxPagePixelSize,
  sourceWindowCss,
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
  const normalizedSourceWindow = normalizeRect(
    "sourceWindowCss",
    sourceWindowCss,
  );
  const lodLevel = retainedTexturePageLodLevel(normalizedLodScale);
  const scaleKey = retainedTexturePageScaleKey(normalizedLodScale);
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
        lodLevel,
        lodScale: normalizedLodScale,
        pixelHeight: Math.max(
          1,
          Math.ceil(pageRect.height * normalizedLodScale),
        ),
        pixelWidth: Math.max(1, Math.ceil(pageRect.width * normalizedLodScale)),
        scaleKey,
        sourceRectCss: pageRect,
        sourceWindowCss: normalizedSourceWindow,
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
  return resolveRetainedTexturePageCoverage({
    cache,
    desiredPages,
    usedFrame,
  }).drawQuads;
}

export function resolveRetainedTexturePageCoverage<TResource>({
  cache,
  desiredPages,
  usedFrame,
}: {
  readonly cache: RetainedTexturePageCache<TResource>;
  readonly desiredPages: readonly RetainedTexturePageDescriptor[];
  readonly usedFrame?: number | undefined;
}): RetainedTexturePageCoverage<TResource> {
  const quads: RetainedTexturePageDrawQuad<TResource>[] = [];
  const protectedPageKeys = new Set<string>();
  const refinementDescriptors: RetainedTexturePageDescriptor[] = [];
  const uncoveredRectsCss: GpuRect[] = [];
  for (const desiredDescriptor of desiredPages) {
    const exactDrawQuad = resolveExactPageDrawQuad({
      cache,
      desiredDescriptor,
      usedFrame,
    });
    if (exactDrawQuad) {
      protectedPageKeys.add(exactDrawQuad.page.key);
      quads.push(exactDrawQuad);
      continue;
    }

    refinementDescriptors.push(desiredDescriptor);
    const fallbackCoverage = resolveFallbackPageDrawQuads({
      cache,
      desiredDescriptor,
      usedFrame,
    });
    for (const pageKey of fallbackCoverage.protectedPageKeys) {
      protectedPageKeys.add(pageKey);
    }
    quads.push(...fallbackCoverage.drawQuads);
    uncoveredRectsCss.push(...fallbackCoverage.uncoveredRectsCss);
  }
  return {
    drawQuads: quads,
    protectedPageKeys: [...protectedPageKeys],
    refinementDescriptors,
    targetDescriptors: desiredPages,
    uncoveredRectsCss,
  };
}

function resolveExactPageDrawQuad<TResource>({
  cache,
  desiredDescriptor,
  usedFrame,
}: {
  readonly cache: RetainedTexturePageCache<TResource>;
  readonly desiredDescriptor: RetainedTexturePageDescriptor;
  readonly usedFrame?: number | undefined;
}): RetainedTexturePageDrawQuad<TResource> | null {
  const exactPage = cache.getCommittedPage(
    retainedTexturePageKey(desiredDescriptor),
  );
  if (!exactPage) {
    return null;
  }
  return {
    desiredDescriptor,
    page: markPageUsed({ cache, page: exactPage, usedFrame }),
    sampleRectCss: desiredDescriptor.sourceRectCss,
  };
}

function resolveFallbackPageDrawQuads<TResource>({
  cache,
  desiredDescriptor,
  usedFrame,
}: {
  readonly cache: RetainedTexturePageCache<TResource>;
  readonly desiredDescriptor: RetainedTexturePageDescriptor;
  readonly usedFrame?: number | undefined;
}): Omit<
  RetainedTexturePageCoverage<TResource>,
  "refinementDescriptors" | "targetDescriptors"
> {
  const drawQuads: RetainedTexturePageDrawQuad<TResource>[] = [];
  const protectedPageKeys = new Set<string>();
  let uncoveredRects: readonly GpuRect[] = [desiredDescriptor.sourceRectCss];
  const candidates = cache.getCommittedPagesForCoverage({
    contentVersion: desiredDescriptor.contentVersion,
    sourceRectCss: desiredDescriptor.sourceRectCss,
    sourceWindowCss: desiredDescriptor.sourceWindowCss,
    surfaceId: desiredDescriptor.surfaceId,
    targetLodScale: desiredDescriptor.lodScale,
  });
  for (const candidate of candidates) {
    const result = coverRectsWithPage({
      cache,
      candidate,
      desiredDescriptor,
      uncoveredRects,
      usedFrame,
    });
    drawQuads.push(...result.drawQuads);
    if (result.usedPageKey) {
      protectedPageKeys.add(result.usedPageKey);
    }
    uncoveredRects = result.uncoveredRectsCss;
    if (uncoveredRects.length === 0) {
      break;
    }
  }
  return {
    drawQuads,
    protectedPageKeys: [...protectedPageKeys],
    uncoveredRectsCss: uncoveredRects,
  };
}

function coverRectsWithPage<TResource>({
  cache,
  candidate,
  desiredDescriptor,
  uncoveredRects,
  usedFrame,
}: {
  readonly cache: RetainedTexturePageCache<TResource>;
  readonly candidate: CommittedRetainedTexturePage<TResource>;
  readonly desiredDescriptor: RetainedTexturePageDescriptor;
  readonly uncoveredRects: readonly GpuRect[];
  readonly usedFrame?: number | undefined;
}): {
  readonly drawQuads: readonly RetainedTexturePageDrawQuad<TResource>[];
  readonly uncoveredRectsCss: readonly GpuRect[];
  readonly usedPageKey: string | null;
} {
  const drawQuads: RetainedTexturePageDrawQuad<TResource>[] = [];
  const nextUncoveredRects: GpuRect[] = [];
  let usedPage: CommittedRetainedTexturePage<TResource> | null = null;
  for (const uncoveredRect of uncoveredRects) {
    const sampleRect = intersectRects(
      uncoveredRect,
      candidate.descriptor.sourceRectCss,
    );
    if (!sampleRect) {
      nextUncoveredRects.push(uncoveredRect);
      continue;
    }
    usedPage =
      usedPage ?? markPageUsed({ cache, page: candidate, usedFrame });
    drawQuads.push({
      desiredDescriptor,
      page: usedPage,
      sampleRectCss: sampleRect,
    });
    nextUncoveredRects.push(...subtractRect(uncoveredRect, sampleRect));
  }
  return {
    drawQuads,
    uncoveredRectsCss: nextUncoveredRects,
    usedPageKey: usedPage?.key ?? null,
  };
}

function markPageUsed<TResource>({
  cache,
  page,
  usedFrame,
}: {
  readonly cache: RetainedTexturePageCache<TResource>;
  readonly page: CommittedRetainedTexturePage<TResource>;
  readonly usedFrame?: number | undefined;
}): CommittedRetainedTexturePage<TResource> {
  return usedFrame === undefined
    ? page
    : cache.markCommittedPageUsed(page.key, usedFrame) ?? page;
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

function subtractRect(rect: GpuRect, cutout: GpuRect): readonly GpuRect[] {
  const intersection = intersectRects(rect, cutout);
  if (!intersection) {
    return [rect];
  }
  const rectRight = rect.x + rect.width;
  const rectBottom = rect.y + rect.height;
  const cutoutRight = intersection.x + intersection.width;
  const cutoutBottom = intersection.y + intersection.height;
  return [
    {
      height: intersection.y - rect.y,
      width: rect.width,
      x: rect.x,
      y: rect.y,
    },
    {
      height: rectBottom - cutoutBottom,
      width: rect.width,
      x: rect.x,
      y: cutoutBottom,
    },
    {
      height: intersection.height,
      width: intersection.x - rect.x,
      x: rect.x,
      y: intersection.y,
    },
    {
      height: intersection.height,
      width: rectRight - cutoutRight,
      x: cutoutRight,
      y: intersection.y,
    },
  ].filter((fragment) => fragment.width > 0 && fragment.height > 0);
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

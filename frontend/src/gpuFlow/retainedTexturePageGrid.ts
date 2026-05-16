import type { RetainedFidelityState } from "./retainedContentLifecycle";
import {
  RetainedTexturePageCache,
  retainedTexturePageLodLevel,
  retainedTexturePageScaleKey,
  type CommittedRetainedTexturePage,
  type RetainedTexturePageDescriptor,
  type RetainedTexturePageRejectedCoverage,
} from "./retainedTexturePages";
import type { GpuRect } from "./viewportMath";

const PAGE_GRID_EDGE_EPSILON = 1e-6;

export type RetainedTexturePageGridInput = {
  readonly contentBoundsCss: GpuRect;
  readonly contentVersion: number;
  readonly devicePixelRatioBucket: number;
  readonly lodScale: number;
  readonly maxPagePixelSize: number;
  readonly sourceKey: string;
  readonly sourceVersion: number;
  readonly sourceWindowCss: GpuRect;
  readonly surfaceId: string;
  readonly visibleSourceRectCss: GpuRect;
  readonly viewportZoomBucket: number;
};

export type RetainedTexturePageDrawQuad<TResource = unknown> = {
  readonly coverageKind: "exact" | "compatible";
  readonly desiredDescriptor: RetainedTexturePageDescriptor;
  readonly fidelityState: Exclude<RetainedFidelityState, "refining">;
  readonly page: CommittedRetainedTexturePage<TResource>;
  readonly sampleRectCss: GpuRect;
  readonly staleContent: boolean;
};

export type RetainedTexturePageCoverage<TResource = unknown> = {
  readonly coverageCandidateCount: number;
  readonly compatibleCoverageRects: readonly GpuRect[];
  readonly drawQuads: readonly RetainedTexturePageDrawQuad<TResource>[];
  readonly exactCoverageRects: readonly GpuRect[];
  readonly fidelityState: RetainedFidelityState;
  readonly mergedDrawQuadCount: number;
  readonly protectedPageKeys: readonly string[];
  readonly rejectedStaleRects: readonly RetainedTexturePageRejectedCoverage[];
  readonly refinementDescriptors: readonly RetainedTexturePageDescriptor[];
  readonly rejectedStaleRectCount: number;
  readonly targetDescriptors: readonly RetainedTexturePageDescriptor[];
  readonly trueHoleRects: readonly GpuRect[];
  readonly trueHoleRectsCss: readonly GpuRect[];
};

export function createRetainedTexturePageDescriptors({
  contentBoundsCss,
  contentVersion,
  devicePixelRatioBucket,
  lodScale,
  maxPagePixelSize,
  sourceKey,
  sourceVersion,
  sourceWindowCss,
  surfaceId,
  visibleSourceRectCss,
  viewportZoomBucket,
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
        devicePixelRatioBucket,
        lodLevel,
        lodScale: normalizedLodScale,
        pixelHeight: Math.max(
          1,
          Math.ceil(pageRect.height * normalizedLodScale),
        ),
        pixelWidth: Math.max(1, Math.ceil(pageRect.width * normalizedLodScale)),
        scaleKey,
        sourceKey,
        sourceRectCss: pageRect,
        sourceVersion,
        sourceWindowCss: normalizedSourceWindow,
        surfaceId,
        tileColumn: column,
        tileRow: row,
        viewportZoomBucket,
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
  const rejectedStaleRects: RetainedTexturePageRejectedCoverage[] = [];
  const refinementDescriptors: RetainedTexturePageDescriptor[] = [];
  const trueHoleRectsCss: GpuRect[] = [];
  let coverageCandidateCount = 0;
  let rejectedStaleRectCount = 0;
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
    const compatibleCoverage = resolveCompatiblePageDrawQuads({
      cache,
      desiredDescriptor,
      usedFrame,
    });
    coverageCandidateCount += compatibleCoverage.coverageCandidateCount;
    rejectedStaleRectCount += compatibleCoverage.rejectedStaleRectCount;
    rejectedStaleRects.push(...compatibleCoverage.rejectedStaleRects);
    for (const pageKey of compatibleCoverage.protectedPageKeys) {
      protectedPageKeys.add(pageKey);
    }
    quads.push(...compatibleCoverage.drawQuads);
    trueHoleRectsCss.push(...compatibleCoverage.trueHoleRectsCss);
  }
  const mergedQuads = mergeRetainedTexturePageDrawQuads(quads);
  const exactCoverageRects = mergedQuads
    .filter((quad) => quad.coverageKind === "exact")
    .map((quad) => quad.sampleRectCss);
  const compatibleCoverageRects = mergedQuads
    .filter((quad) => quad.coverageKind === "compatible")
    .map((quad) => quad.sampleRectCss);
  return {
    compatibleCoverageRects,
    coverageCandidateCount,
    drawQuads: mergedQuads,
    exactCoverageRects,
    fidelityState: resolveCoverageFidelityState({
      drawQuads: mergedQuads,
      refinementDescriptors,
      trueHoleRects: trueHoleRectsCss,
    }),
    mergedDrawQuadCount: Math.max(0, quads.length - mergedQuads.length),
    protectedPageKeys: [...protectedPageKeys],
    rejectedStaleRects,
    refinementDescriptors,
    rejectedStaleRectCount,
    targetDescriptors: desiredPages,
    trueHoleRects: trueHoleRectsCss,
    trueHoleRectsCss,
  };
}

function mergeRetainedTexturePageDrawQuads<TResource>(
  drawQuads: readonly RetainedTexturePageDrawQuad<TResource>[],
): readonly RetainedTexturePageDrawQuad<TResource>[] {
  const merged: RetainedTexturePageDrawQuad<TResource>[] = [];
  for (const drawQuad of drawQuads) {
    const previous = merged.at(-1);
    const mergedQuad = previous
      ? mergeAdjacentDrawQuads(previous, drawQuad)
      : null;
    if (mergedQuad) {
      merged[merged.length - 1] = mergedQuad;
      continue;
    }
    merged.push(drawQuad);
  }
  return merged;
}

function mergeAdjacentDrawQuads<TResource>(
  left: RetainedTexturePageDrawQuad<TResource>,
  right: RetainedTexturePageDrawQuad<TResource>,
): RetainedTexturePageDrawQuad<TResource> | null {
  if (left.page.key !== right.page.key) {
    return null;
  }
  const horizontal = mergeHorizontalRects(
    left.sampleRectCss,
    right.sampleRectCss,
  );
  if (horizontal) {
    return mergeDrawQuad(left, right, horizontal);
  }
  const vertical = mergeVerticalRects(left.sampleRectCss, right.sampleRectCss);
  return vertical ? mergeDrawQuad(left, right, vertical) : null;
}

function mergeDrawQuad<TResource>(
  left: RetainedTexturePageDrawQuad<TResource>,
  right: RetainedTexturePageDrawQuad<TResource>,
  sampleRectCss: GpuRect,
): RetainedTexturePageDrawQuad<TResource> {
  return {
    ...left,
    coverageKind:
      left.coverageKind === "exact" && right.coverageKind === "exact"
        ? "exact"
        : "compatible",
    fidelityState:
      left.fidelityState === "target"
        ? right.fidelityState
        : left.fidelityState,
    sampleRectCss,
    staleContent: left.staleContent || right.staleContent,
  };
}

function mergeHorizontalRects(left: GpuRect, right: GpuRect): GpuRect | null {
  if (
    left.y !== right.y ||
    left.height !== right.height ||
    left.x + left.width !== right.x
  ) {
    return null;
  }
  return {
    height: left.height,
    width: left.width + right.width,
    x: left.x,
    y: left.y,
  };
}

function mergeVerticalRects(left: GpuRect, right: GpuRect): GpuRect | null {
  if (
    left.x !== right.x ||
    left.width !== right.width ||
    left.y + left.height !== right.y
  ) {
    return null;
  }
  return {
    height: left.height + right.height,
    width: left.width,
    x: left.x,
    y: left.y,
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
  const exactCandidate = cache
    .getCommittedPageCoverageCandidates({
      contentVersion: desiredDescriptor.contentVersion,
      contentSegments: desiredDescriptor.contentSegments,
      devicePixelRatioBucket: desiredDescriptor.devicePixelRatioBucket,
      pixelHeight: desiredDescriptor.pixelHeight,
      pixelWidth: desiredDescriptor.pixelWidth,
      sourceKey: desiredDescriptor.sourceKey,
      sourceRectCss: desiredDescriptor.sourceRectCss,
      sourceVersion: desiredDescriptor.sourceVersion,
      sourceWindowCss: desiredDescriptor.sourceWindowCss,
      surfaceId: desiredDescriptor.surfaceId,
      targetLodScale: desiredDescriptor.lodScale,
      textLikeSnapshots: desiredDescriptor.textLikeSnapshots,
      tileColumn: desiredDescriptor.tileColumn,
      tileRow: desiredDescriptor.tileRow,
      viewportZoomBucket: desiredDescriptor.viewportZoomBucket,
    })
    .find((candidate) => candidate.compatibility.fidelity === "target");
  if (!exactCandidate) {
    return null;
  }
  return {
    coverageKind: "exact",
    desiredDescriptor,
    fidelityState: "target",
    page: markPageUsed({ cache, page: exactCandidate.page, usedFrame }),
    sampleRectCss: desiredDescriptor.sourceRectCss,
    staleContent: false,
  };
}

function resolveCompatiblePageDrawQuads<TResource>({
  cache,
  desiredDescriptor,
  usedFrame,
}: {
  readonly cache: RetainedTexturePageCache<TResource>;
  readonly desiredDescriptor: RetainedTexturePageDescriptor;
  readonly usedFrame?: number | undefined;
}): Omit<
  RetainedTexturePageCoverage<TResource>,
  | "compatibleCoverageRects"
  | "exactCoverageRects"
  | "fidelityState"
  | "mergedDrawQuadCount"
  | "refinementDescriptors"
  | "targetDescriptors"
  | "trueHoleRects"
> {
  const drawQuads: RetainedTexturePageDrawQuad<TResource>[] = [];
  const protectedPageKeys = new Set<string>();
  let uncoveredRects: readonly GpuRect[] = [desiredDescriptor.sourceRectCss];
  const rejectedStaleRects = cache.getRejectedCommittedPagesForCoverage({
    contentVersion: desiredDescriptor.contentVersion,
    contentSegments: desiredDescriptor.contentSegments,
    devicePixelRatioBucket: desiredDescriptor.devicePixelRatioBucket,
    pixelHeight: desiredDescriptor.pixelHeight,
    pixelWidth: desiredDescriptor.pixelWidth,
    sourceKey: desiredDescriptor.sourceKey,
    sourceRectCss: desiredDescriptor.sourceRectCss,
    sourceVersion: desiredDescriptor.sourceVersion,
    sourceWindowCss: desiredDescriptor.sourceWindowCss,
    surfaceId: desiredDescriptor.surfaceId,
    targetLodScale: desiredDescriptor.lodScale,
    textLikeSnapshots: desiredDescriptor.textLikeSnapshots,
    tileColumn: desiredDescriptor.tileColumn,
    tileRow: desiredDescriptor.tileRow,
    viewportZoomBucket: desiredDescriptor.viewportZoomBucket,
  });
  const candidates = cache.getCommittedPageCoverageCandidates({
    contentVersion: desiredDescriptor.contentVersion,
    contentSegments: desiredDescriptor.contentSegments,
    devicePixelRatioBucket: desiredDescriptor.devicePixelRatioBucket,
    pixelHeight: desiredDescriptor.pixelHeight,
    pixelWidth: desiredDescriptor.pixelWidth,
    sourceKey: desiredDescriptor.sourceKey,
    sourceRectCss: desiredDescriptor.sourceRectCss,
    sourceVersion: desiredDescriptor.sourceVersion,
    sourceWindowCss: desiredDescriptor.sourceWindowCss,
    surfaceId: desiredDescriptor.surfaceId,
    targetLodScale: desiredDescriptor.lodScale,
    textLikeSnapshots: desiredDescriptor.textLikeSnapshots,
    tileColumn: desiredDescriptor.tileColumn,
    tileRow: desiredDescriptor.tileRow,
    viewportZoomBucket: desiredDescriptor.viewportZoomBucket,
  });
  for (const candidate of candidates) {
    const result = coverRectsWithPage({
      cache,
      candidate: candidate.page,
      fidelityState: candidate.compatibility.fidelity,
      desiredDescriptor,
      uncoveredRects,
      usedFrame,
    });
    drawQuads.push(...result.drawQuads);
    if (result.usedPageKey) {
      protectedPageKeys.add(result.usedPageKey);
    }
    uncoveredRects = result.trueHoleRectsCss;
    if (uncoveredRects.length === 0) {
      break;
    }
  }
  return {
    coverageCandidateCount: candidates.length,
    drawQuads,
    protectedPageKeys: [...protectedPageKeys],
    rejectedStaleRectCount: rejectedStaleRects.length,
    rejectedStaleRects,
    trueHoleRectsCss: uncoveredRects,
  };
}

function coverRectsWithPage<TResource>({
  cache,
  candidate,
  desiredDescriptor,
  fidelityState,
  uncoveredRects,
  usedFrame,
}: {
  readonly cache: RetainedTexturePageCache<TResource>;
  readonly candidate: CommittedRetainedTexturePage<TResource>;
  readonly desiredDescriptor: RetainedTexturePageDescriptor;
  readonly fidelityState: Exclude<RetainedFidelityState, "refining">;
  readonly uncoveredRects: readonly GpuRect[];
  readonly usedFrame?: number | undefined;
}): {
  readonly drawQuads: readonly RetainedTexturePageDrawQuad<TResource>[];
  readonly trueHoleRectsCss: readonly GpuRect[];
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
    usedPage = usedPage ?? markPageUsed({ cache, page: candidate, usedFrame });
    drawQuads.push({
      coverageKind: "compatible",
      desiredDescriptor,
      fidelityState,
      page: usedPage,
      sampleRectCss: sampleRect,
      staleContent: false,
    });
    nextUncoveredRects.push(...subtractRect(uncoveredRect, sampleRect));
  }
  return {
    drawQuads,
    trueHoleRectsCss: nextUncoveredRects,
    usedPageKey: usedPage?.key ?? null,
  };
}

function resolveCoverageFidelityState<TResource>({
  drawQuads,
  refinementDescriptors,
  trueHoleRects,
}: {
  readonly drawQuads: readonly RetainedTexturePageDrawQuad<TResource>[];
  readonly refinementDescriptors: readonly RetainedTexturePageDescriptor[];
  readonly trueHoleRects: readonly GpuRect[];
}): RetainedFidelityState {
  if (trueHoleRects.length > 0) {
    return "refining";
  }
  const compatibleQuad = drawQuads.find(
    (quad) => quad.coverageKind === "compatible",
  );
  if (compatibleQuad) {
    return compatibleQuad.fidelityState;
  }
  return refinementDescriptors.length > 0 ? "refining" : "target";
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

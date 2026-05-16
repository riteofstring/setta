import {
  intersectRects,
  rectArea,
  rectKey,
} from "./retainedCommittedCoverageGeometry";
import type {
  RetainedFidelityMetadata,
  RetainedRegionContentSegment,
  RetainedRegionManifest,
  RetainedRegionTarget,
  RetainedRegionTextLikeSnapshot,
} from "./retainedCommittedCoverageStore";
import type { RetainedFidelityState } from "./retainedContentLifecycle";
import { retainedContentRectToTextureRect } from "./retainedContentLifecycle";
import type { RetainedContentTextureResources } from "./retainedContentTextureResources";
import type { RetainedTexturePageSurfaceLayout } from "./retainedTexturePageVisuals";
import {
  retainedTexturePageLodLevel,
  retainedTexturePageScaleKey,
  type CommittedRetainedTexturePage,
  type RetainedTexturePageCache,
  type RetainedTexturePageRegionCoverageEntry,
} from "./retainedTexturePages";
import type { RetainedVisualEpochKind } from "./retainedVisualEpochs";
import type { GpuRect } from "./viewportMath";

type RetainedFidelityTarget = RetainedFidelityMetadata;

type TextureRect = GpuRect;

type TextureUvRect = {
  readonly u0: number;
  readonly u1: number;
  readonly v0: number;
  readonly v1: number;
};

type RetainedRegionTargetReason =
  | "active-island"
  | "newly-exposed"
  | "refinement"
  | "visible";

export type RetainedVisibleRegionSurface = {
  readonly contentBoundsCss: GpuRect;
  readonly contentSegments?: readonly RetainedRegionContentSegment[];
  readonly contentVersion: number;
  readonly layout: RetainedTexturePageSurfaceLayout;
  readonly sourceKey: string;
  readonly sourceVersion: number;
  readonly sourceWindowCss: GpuRect;
  readonly surfaceId: string;
  readonly textLikeSnapshots?: readonly RetainedRegionTextLikeSnapshot[];
  readonly visibleSourceRectCss: GpuRect;
};

export type RetainedVisibleRegionTarget = RetainedRegionTarget & {
  readonly reason: RetainedRegionTargetReason;
  readonly surfaceLayout: RetainedTexturePageSurfaceLayout;
};

type RetainedContentToTextureMappingProof = {
  readonly clipRect: GpuRect;
  readonly contentRect: GpuRect;
  readonly dpr: number;
  readonly fidelity: RetainedFidelityTarget;
  readonly generation: number;
  readonly ownerManifest: RetainedRegionManifest;
  readonly sourceRect: GpuRect;
  readonly textureRect: TextureRect;
  readonly uvRect: TextureUvRect;
  readonly zoomBucket: number;
};

type RetainedSurfaceZOrder = number;

export type RetainedDrawRegion<TResource = RetainedContentTextureResources> = {
  readonly clipRect: GpuRect;
  readonly coverageKind: "compatible" | "exact";
  readonly fidelityState: Exclude<RetainedFidelityState, "refining">;
  readonly flowRect: GpuRect;
  readonly mappingProof: RetainedContentToTextureMappingProof;
  readonly page: CommittedRetainedTexturePage<TResource>;
  readonly renderLayer:
    | "native-underlay"
    | "retained-content"
    | "retained-overlay";
  readonly sampleRectCss: GpuRect;
  readonly textureHandle: string;
  readonly uvRect: TextureUvRect;
  readonly zOrder: RetainedSurfaceZOrder;
};

type RetainedReplacementRequestKey = {
  readonly contentRect: GpuRect;
  readonly contentVersion: string;
  readonly fidelityTarget: RetainedFidelityTarget;
  readonly owner: string;
};

export type RetainedReplacementRequest = {
  readonly key: RetainedReplacementRequestKey;
  readonly contentManifest: RetainedRegionManifest;
  readonly reason:
    | "active-island-detach"
    | "content-dirty"
    | "target-fidelity-missing"
    | "true-hole";
  readonly priority:
    | "interactive"
    | "prefetch"
    | "visible-hole"
    | "visible-refinement";
  readonly target: RetainedVisibleRegionTarget;
};

type RetainedVisibleCoverageProof = {
  readonly compatibleCoveredAreaCssPx: number;
  readonly exactCoveredAreaCssPx: number;
  readonly rejectedCoverageCountByReason: Readonly<Record<string, number>>;
  readonly replacementRequestedAreaCssPx: number;
  readonly trueHoleAreaCssPx: number;
  readonly visibleAreaCssPx: number;
};

type RetainedVisibleTrueHoleEntry = {
  readonly rect: GpuRect;
  readonly target: RetainedVisibleRegionTarget;
};

type RetainedCoveragePlanCost = {
  readonly allocatedDiagnosticRectCount: number;
  readonly candidateCount: number;
  readonly compatibilityCheckCount: number;
  readonly coverageFragmentCount: number;
  readonly drawRegionCount: number;
  readonly maxFragmentsPerVisibleTarget: number;
  readonly rejectedSampleCount: number;
  readonly sliverDiscardedAreaCssPx: number;
  readonly spatialQueryCount: number;
  readonly visibleRegionCount: number;
  readonly visibleRegionGroupCount: number;
};

type RetainedCoveragePlanDiagnostics = {
  readonly committedCandidateCount: number;
  readonly compatibleRegionCount: number;
  readonly compatibilityDurationMs: number;
  readonly cost: RetainedCoveragePlanCost;
  readonly coverageFragmentCount: number;
  readonly coveragePlanDurationMs: number;
  readonly drawRegionCount: number;
  readonly exactRegionCount: number;
  readonly maxFragmentsPerVisibleTarget: number;
  readonly rejectedCoverageCountByReason: Readonly<Record<string, number>>;
  readonly sampledRejectedCoverage: readonly {
    readonly reason: string;
    readonly rect: GpuRect;
  }[];
  readonly spatialQueryDurationMs: number;
  readonly trueHoleAreaCssPx: number;
  readonly trueHoleRectCount: number;
  readonly visibleRegionCount: number;
};

export type RetainedVisibleCoveragePlan<
  TResource = RetainedContentTextureResources,
> = {
  readonly diagnostics: RetainedCoveragePlanDiagnostics;
  readonly drawRegions: readonly RetainedDrawRegion<TResource>[];
  readonly nativeIslandRegions: readonly never[];
  readonly proof: RetainedVisibleCoverageProof;
  readonly protectedPageKeys: readonly string[];
  readonly replacementRequests: readonly RetainedReplacementRequest[];
  readonly trueHoles: readonly GpuRect[];
  readonly visibleRegionTargets: readonly RetainedVisibleRegionTarget[];
};

export function createRetainedVisibleRegionTargets({
  devicePixelRatioBucket,
  lodScale,
  surfaces,
  viewportZoomBucket,
}: {
  readonly devicePixelRatioBucket: number;
  readonly lodScale: number;
  readonly surfaces: readonly RetainedVisibleRegionSurface[];
  readonly viewportZoomBucket: number;
}): readonly RetainedVisibleRegionTarget[] {
  const targets: RetainedVisibleRegionTarget[] = [];
  for (const surface of surfaces) {
    const contentRect = intersectRects(
      surface.visibleSourceRectCss,
      surface.contentBoundsCss,
    );
    if (!contentRect) {
      continue;
    }
    const clipRect = surface.sourceWindowCss;
    const manifest = createVisibleRegionManifest({
      clipRect,
      contentRect,
      surface,
    });
    targets.push(
      Object.freeze({
        clipRect,
        contentRect,
        fidelity: createVisibleRegionFidelity({
          contentRect,
          devicePixelRatioBucket,
          lodScale,
          surface,
          viewportZoomBucket,
        }),
        manifest,
        reason: "visible",
        surfaceLayout: surface.layout,
        zLayer: surface.layout.zIndex ?? 0,
      }),
    );
  }
  return Object.freeze(targets);
}

export function planRetainedVisibleCoverage<
  TResource = RetainedContentTextureResources,
>({
  cache,
  frame,
  targets,
}: {
  readonly cache: RetainedTexturePageCache<TResource>;
  readonly frame: number;
  readonly targets: readonly RetainedVisibleRegionTarget[];
}): RetainedVisibleCoveragePlan<TResource> {
  const startedAt = nowMs();
  const coverage = cache.queryVisibleRegionCoverage({
    targets,
    usedFrame: frame,
  });
  const drawRegions = mergeRetainedDrawRegions([
    ...coverage.exactCoverage.map((entry) =>
      createRetainedDrawRegion({
        coverageKind: "exact",
        entry,
      }),
    ),
    ...coverage.compatibleCoverage.map((entry) =>
      createRetainedDrawRegion({
        coverageKind:
          entry.compatibility.fidelity !== "deterministic-base" &&
          entryMatchesTargetFidelity(entry)
            ? "exact"
            : "compatible",
        entry,
      }),
    ),
  ]);
  const trueHoleEntries = Object.freeze(
    coverage.uncoveredRegionEntries.map((entry) =>
      Object.freeze({
        rect: Object.freeze({ ...entry.rect }),
        target: entry.target as RetainedVisibleRegionTarget,
      }),
    ),
  );
  const trueHoles = Object.freeze(trueHoleEntries.map((entry) => entry.rect));
  const replacementRequests = createReplacementRequests({
    drawRegions,
    targets,
    trueHoleEntries,
  });
  const proof = createVisibleCoverageProof({
    drawRegions,
    rejectedCoverageCountByReason:
      coverage.diagnostics.rejectedCoverageCountByReason,
    replacementRequests,
    targets,
    trueHoles,
  });
  const diagnostics = createCoveragePlanDiagnostics({
    coverageDiagnostics: coverage.diagnostics,
    coveragePlanDurationMs: nowMs() - startedAt,
    drawRegions,
    rejectedCoverage: coverage.rejectedCoverage,
    trueHoles,
    targets,
  });
  return Object.freeze({
    diagnostics,
    drawRegions,
    nativeIslandRegions: Object.freeze([]),
    proof,
    protectedPageKeys: coverage.protectedPageKeys,
    replacementRequests,
    trueHoles,
    visibleRegionTargets: targets,
  });
}

function createVisibleRegionManifest({
  clipRect,
  contentRect,
  surface,
}: {
  readonly clipRect: GpuRect;
  readonly contentRect: GpuRect;
  readonly surface: RetainedVisibleRegionSurface;
}): RetainedRegionManifest {
  return Object.freeze({
    clipRect: Object.freeze({ ...clipRect }),
    contentRect: Object.freeze({ ...contentRect }),
    contentSegments: Object.freeze(
      (surface.contentSegments ?? []).map((segment) =>
        Object.freeze({
          ...segment,
          rectCss: Object.freeze({ ...segment.rectCss }),
        }),
      ),
    ),
    contentVersion: surface.contentVersion,
    documentId: surface.sourceKey,
    fontGeneration: 0,
    renderMode: "passive",
    rowId: null,
    sectionId: surface.surfaceId,
    surfaceId: surface.surfaceId,
    textLikeSnapshots: Object.freeze(
      (surface.textLikeSnapshots ?? []).map((snapshot) =>
        Object.freeze({
          ...snapshot,
          rectCss: Object.freeze({ ...snapshot.rectCss }),
        }),
      ),
    ),
    themeGeneration: surface.sourceVersion,
    visualEpochKind: retainedVisualEpochKindForSurface(surface),
  });
}

function createVisibleRegionFidelity({
  contentRect,
  devicePixelRatioBucket,
  lodScale,
  surface,
  viewportZoomBucket,
}: {
  readonly contentRect: GpuRect;
  readonly devicePixelRatioBucket: number;
  readonly lodScale: number;
  readonly surface: RetainedVisibleRegionSurface;
  readonly viewportZoomBucket: number;
}): RetainedFidelityMetadata {
  const lodLevel = retainedTexturePageLodLevel(lodScale);
  return Object.freeze({
    devicePixelRatioBucket,
    lodLevel,
    lodScale,
    pageGridGeneration: [
      "semantic-region",
      surface.surfaceId,
      surface.sourceKey,
      surface.sourceVersion,
      surface.contentVersion,
      retainedTexturePageScaleKey(lodScale),
      viewportZoomBucket,
      retainedVisualEpochKindForSurface(surface),
    ].join(":"),
    pixelHeight: Math.max(1, Math.ceil(contentRect.height * lodScale)),
    pixelWidth: Math.max(1, Math.ceil(contentRect.width * lodScale)),
    viewportZoomBucket,
  });
}

function retainedVisualEpochKindForSurface(
  surface: RetainedVisibleRegionSurface,
): Exclude<RetainedVisualEpochKind, "active-dom"> {
  return surface.textLikeSnapshots?.length ? "snapshot-exact" : "base";
}

function createRetainedDrawRegion<TResource>({
  coverageKind,
  entry,
}: {
  readonly coverageKind: "compatible" | "exact";
  readonly entry: RetainedTexturePageRegionCoverageEntry<TResource>;
}): RetainedDrawRegion<TResource> {
  const target = entry.target as RetainedVisibleRegionTarget;
  const uvRect = retainedContentRectToTextureRect(
    entry.page,
    entry.coverageRect,
  );
  return Object.freeze({
    clipRect: Object.freeze({ ...target.clipRect }),
    coverageKind,
    fidelityState:
      coverageKind === "exact"
        ? "target"
        : retainedCoverageFidelityState(entry),
    flowRect: Object.freeze(
      toFlowRect(target.surfaceLayout, entry.coverageRect),
    ),
    mappingProof: Object.freeze({
      clipRect: Object.freeze({ ...entry.region.clipRect }),
      contentRect: Object.freeze({ ...entry.region.contentRect }),
      dpr: entry.region.fidelity.devicePixelRatioBucket,
      fidelity: Object.freeze({ ...entry.region.fidelity }),
      generation: entry.region.generation,
      ownerManifest: entry.region.manifest,
      sourceRect: Object.freeze({ ...entry.coverageRect }),
      textureRect: Object.freeze({
        height: entry.page.descriptor.pixelHeight,
        width: entry.page.descriptor.pixelWidth,
        x: 0,
        y: 0,
      }),
      uvRect: Object.freeze({ ...uvRect }),
      zoomBucket: entry.region.fidelity.viewportZoomBucket,
    }),
    page: entry.page,
    renderLayer: "retained-content",
    sampleRectCss: Object.freeze({ ...entry.coverageRect }),
    textureHandle: entry.page.key,
    uvRect: Object.freeze({ ...uvRect }),
    zOrder: target.zLayer,
  });
}

function retainedCoverageFidelityState<TResource>(
  entry: RetainedTexturePageRegionCoverageEntry<TResource>,
): Exclude<RetainedFidelityState, "refining"> {
  if (entry.compatibility.fidelity === "deterministic-base") {
    return "compatible-deterministic-base";
  }
  if (
    entry.region.fidelity.lodLevel !== entry.target.fidelity.lodLevel ||
    entry.region.fidelity.lodScale !== entry.target.fidelity.lodScale
  ) {
    return "compatible-lower-lod";
  }
  if (
    entry.region.fidelity.devicePixelRatioBucket !==
    entry.target.fidelity.devicePixelRatioBucket
  ) {
    return "compatible-previous-dpr-bucket";
  }
  if (
    entry.region.fidelity.pageGridGeneration !==
    entry.target.fidelity.pageGridGeneration
  ) {
    return "compatible-previous-grid";
  }
  return entry.compatibility.fidelity === "compatible-mapped-region"
    ? "compatible-mapped-region"
    : "target";
}

function entryMatchesTargetFidelity<TResource>(
  entry: RetainedTexturePageRegionCoverageEntry<TResource>,
): boolean {
  return (
    entry.region.fidelity.devicePixelRatioBucket ===
      entry.target.fidelity.devicePixelRatioBucket &&
    entry.region.fidelity.lodLevel === entry.target.fidelity.lodLevel &&
    entry.region.fidelity.lodScale === entry.target.fidelity.lodScale &&
    entry.region.fidelity.viewportZoomBucket ===
      entry.target.fidelity.viewportZoomBucket
  );
}

function mergeRetainedDrawRegions<TResource>(
  drawRegions: readonly RetainedDrawRegion<TResource>[],
): readonly RetainedDrawRegion<TResource>[] {
  const merged: RetainedDrawRegion<TResource>[] = [];
  for (const drawRegion of drawRegions) {
    const previous = merged.at(-1);
    const mergedRegion = previous
      ? mergeAdjacentDrawRegions(previous, drawRegion)
      : null;
    if (mergedRegion) {
      merged[merged.length - 1] = mergedRegion;
      continue;
    }
    merged.push(drawRegion);
  }
  return Object.freeze(merged);
}

function mergeAdjacentDrawRegions<TResource>(
  left: RetainedDrawRegion<TResource>,
  right: RetainedDrawRegion<TResource>,
): RetainedDrawRegion<TResource> | null {
  if (
    left.textureHandle !== right.textureHandle ||
    left.coverageKind !== right.coverageKind ||
    left.renderLayer !== right.renderLayer ||
    left.zOrder !== right.zOrder
  ) {
    return null;
  }
  const sampleRectCss =
    mergeHorizontalRects(left.sampleRectCss, right.sampleRectCss) ??
    mergeVerticalRects(left.sampleRectCss, right.sampleRectCss);
  if (!sampleRectCss) {
    return null;
  }
  const uvRect = retainedContentRectToTextureRect(left.page, sampleRectCss);
  const flowRect =
    mergeHorizontalRects(left.flowRect, right.flowRect) ??
    mergeVerticalRects(left.flowRect, right.flowRect) ??
    left.flowRect;
  return Object.freeze({
    ...left,
    flowRect: Object.freeze(flowRect),
    mappingProof: Object.freeze({
      ...left.mappingProof,
      sourceRect: Object.freeze({ ...sampleRectCss }),
      uvRect: Object.freeze({ ...uvRect }),
    }),
    sampleRectCss: Object.freeze(sampleRectCss),
    uvRect: Object.freeze({ ...uvRect }),
  });
}

function createReplacementRequests<TResource>({
  drawRegions,
  targets,
  trueHoleEntries,
}: {
  readonly drawRegions: readonly RetainedDrawRegion<TResource>[];
  readonly targets: readonly RetainedVisibleRegionTarget[];
  readonly trueHoleEntries: readonly RetainedVisibleTrueHoleEntry[];
}): readonly RetainedReplacementRequest[] {
  const requests = new Map<string, RetainedReplacementRequest>();
  for (const { rect: trueHole, target } of trueHoleEntries) {
    const requestTarget = retargetVisibleRegion(
      target,
      trueHole,
      "newly-exposed",
    );
    addReplacementRequest(requests, {
      contentManifest: requestTarget.manifest,
      key: createReplacementRequestKey(requestTarget),
      priority: "visible-hole",
      reason: "true-hole",
      target: requestTarget,
    });
  }
  for (const target of targets) {
    const hasCompatibleCoverage = drawRegions.some(
      (drawRegion) =>
        drawRegion.coverageKind === "compatible" &&
        Boolean(intersectRects(drawRegion.sampleRectCss, target.contentRect)),
    );
    if (!hasCompatibleCoverage) {
      continue;
    }
    addReplacementRequest(requests, {
      contentManifest: target.manifest,
      key: createReplacementRequestKey(target),
      priority: "visible-refinement",
      reason: "target-fidelity-missing",
      target,
    });
  }
  return Object.freeze([...requests.values()]);
}

function addReplacementRequest(
  requests: Map<string, RetainedReplacementRequest>,
  request: RetainedReplacementRequest,
): void {
  requests.set(
    replacementRequestKeyString(request.key),
    Object.freeze(request),
  );
}

function createReplacementRequestKey(
  target: RetainedVisibleRegionTarget,
): RetainedReplacementRequestKey {
  return Object.freeze({
    contentRect: Object.freeze({ ...target.contentRect }),
    contentVersion: String(target.manifest.contentVersion),
    fidelityTarget: target.fidelity,
    owner: [
      target.manifest.surfaceId,
      target.manifest.documentId,
      target.manifest.sectionId,
      target.manifest.rowId ?? "row:none",
    ].join("|"),
  });
}

function replacementRequestKeyString(
  key: RetainedReplacementRequestKey,
): string {
  return [
    key.owner,
    key.contentVersion,
    rectKey(key.contentRect),
    key.fidelityTarget.devicePixelRatioBucket,
    key.fidelityTarget.lodLevel,
    key.fidelityTarget.lodScale,
    key.fidelityTarget.viewportZoomBucket,
  ].join("|");
}

function retargetVisibleRegion(
  target: RetainedVisibleRegionTarget,
  contentRect: GpuRect,
  reason: RetainedRegionTargetReason,
): RetainedVisibleRegionTarget {
  const manifest = Object.freeze({
    ...target.manifest,
    contentRect: Object.freeze({ ...contentRect }),
  });
  return Object.freeze({
    ...target,
    contentRect: Object.freeze({ ...contentRect }),
    manifest,
    reason,
  });
}

function createVisibleCoverageProof<TResource>({
  drawRegions,
  rejectedCoverageCountByReason,
  replacementRequests,
  targets,
  trueHoles,
}: {
  readonly drawRegions: readonly RetainedDrawRegion<TResource>[];
  readonly rejectedCoverageCountByReason: Readonly<Record<string, number>>;
  readonly replacementRequests: readonly RetainedReplacementRequest[];
  readonly targets: readonly RetainedVisibleRegionTarget[];
  readonly trueHoles: readonly GpuRect[];
}): RetainedVisibleCoverageProof {
  return Object.freeze({
    compatibleCoveredAreaCssPx: rectSetArea(
      drawRegions
        .filter((region) => region.coverageKind === "compatible")
        .map((region) => region.sampleRectCss),
    ),
    exactCoveredAreaCssPx: rectSetArea(
      drawRegions
        .filter((region) => region.coverageKind === "exact")
        .map((region) => region.sampleRectCss),
    ),
    rejectedCoverageCountByReason,
    replacementRequestedAreaCssPx: rectSetArea(
      replacementRequests.map((request) => request.target.contentRect),
    ),
    trueHoleAreaCssPx: rectSetArea(trueHoles),
    visibleAreaCssPx: rectSetArea(targets.map((target) => target.contentRect)),
  });
}

function createCoveragePlanDiagnostics<TResource>({
  coverageDiagnostics,
  coveragePlanDurationMs,
  drawRegions,
  rejectedCoverage,
  targets,
  trueHoles,
}: {
  readonly coverageDiagnostics: ReturnType<
    RetainedTexturePageCache<TResource>["queryVisibleRegionCoverage"]
  >["diagnostics"];
  readonly coveragePlanDurationMs: number;
  readonly drawRegions: readonly RetainedDrawRegion<TResource>[];
  readonly rejectedCoverage: readonly {
    readonly reason: string;
    readonly rect: GpuRect;
  }[];
  readonly targets: readonly RetainedVisibleRegionTarget[];
  readonly trueHoles: readonly GpuRect[];
}): RetainedCoveragePlanDiagnostics {
  const fragmentsPerTarget = countFragmentsPerTarget({ drawRegions, targets });
  const maxFragmentsPerVisibleTarget =
    fragmentsPerTarget.length === 0 ? 0 : Math.max(...fragmentsPerTarget);
  const coverageFragmentCount = drawRegions.length + trueHoles.length;
  const cost: RetainedCoveragePlanCost = Object.freeze({
    allocatedDiagnosticRectCount:
      coverageDiagnostics.allocatedDiagnosticRectCount,
    candidateCount: coverageDiagnostics.candidateCount,
    compatibilityCheckCount: coverageDiagnostics.compatibilityCheckCount,
    coverageFragmentCount,
    drawRegionCount: drawRegions.length,
    maxFragmentsPerVisibleTarget,
    rejectedSampleCount: rejectedCoverage.length,
    sliverDiscardedAreaCssPx: 0,
    spatialQueryCount: coverageDiagnostics.spatialQueryCount,
    visibleRegionCount: targets.length,
    visibleRegionGroupCount: coverageDiagnostics.visibleRegionGroupCount,
  });
  return Object.freeze({
    committedCandidateCount: coverageDiagnostics.candidateCount,
    compatibleRegionCount: drawRegions.filter(
      (region) => region.coverageKind === "compatible",
    ).length,
    compatibilityDurationMs: 0,
    cost,
    coverageFragmentCount,
    coveragePlanDurationMs,
    drawRegionCount: drawRegions.length,
    exactRegionCount: drawRegions.filter(
      (region) => region.coverageKind === "exact",
    ).length,
    maxFragmentsPerVisibleTarget,
    rejectedCoverageCountByReason:
      coverageDiagnostics.rejectedCoverageCountByReason,
    sampledRejectedCoverage: Object.freeze(
      rejectedCoverage.map((entry) =>
        Object.freeze({
          reason: entry.reason,
          rect: Object.freeze({ ...entry.rect }),
        }),
      ),
    ),
    spatialQueryDurationMs: 0,
    trueHoleAreaCssPx: rectSetArea(trueHoles),
    trueHoleRectCount: trueHoles.length,
    visibleRegionCount: targets.length,
  });
}

function countFragmentsPerTarget<TResource>({
  drawRegions,
  targets,
}: {
  readonly drawRegions: readonly RetainedDrawRegion<TResource>[];
  readonly targets: readonly RetainedVisibleRegionTarget[];
}): readonly number[] {
  return targets.map(
    (target) =>
      drawRegions.filter((region) =>
        Boolean(intersectRects(region.sampleRectCss, target.contentRect)),
      ).length,
  );
}

function rectSetArea(rects: readonly GpuRect[]): number {
  return rects.reduce((total, rect) => total + rectArea(rect), 0);
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

function nowMs(): number {
  return typeof performance === "undefined" ? 0 : performance.now();
}

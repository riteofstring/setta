import type { HtmlSurfaceFlatVisual } from "./htmlSurfaces/visualScene";
import type {
  RetainedCompatibilityRejectReason,
  RetainedFidelityState,
} from "./retainedContentLifecycle";
import type { RetainedContentTexturePagePreparedFrame } from "./retainedContentTexturePageManager";
import type { RetainedContentTextureResources } from "./retainedContentTextureResources";
import {
  createPublishedNativeIslandRects,
  resolveNativeIslandPublicationTransaction,
  type NativeIslandPublicationTransaction,
  type PublishedNativeIslandRect,
} from "./retainedNativeIslandTransactions";
import type { GpuRetainedRuntimeFrame } from "./retainedRuntimeFrame";
import type { RetainedDrawRegion } from "./retainedVisibleCoveragePlanner";
import type { GpuRect } from "./viewportMath";

type RetainedFrameId = number;

type CoverageReadiness = "covered";

type RetainedMotionFrame = GpuRetainedRuntimeFrame["input"] & {
  readonly frameId: RetainedFrameId;
};

type RetainedContentSnapshotFrame = {
  readonly id: RetainedFrameId;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
};

type RetainedPageFrame = RetainedContentTexturePagePreparedFrame;

type RetainedDisplayFrameInput = RetainedContentSnapshotFrame & {
  readonly motionFrame: RetainedMotionFrame;
  readonly pageFrame: RetainedPageFrame;
};

type PublishedRetainedDrawRegion =
  RetainedDrawRegion<RetainedContentTextureResources>;

type PublishedRetainedCompatibleDrawRegion = PublishedRetainedDrawRegion & {
  readonly coverageKind: "compatible";
};

type PublishedRetainedHitIndex = {
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
};

type RetainedMotionContinuityProof = {
  readonly overlapCoveredAreaCssPx: number;
  readonly trueHoleAreaCssPx: number;
  readonly trueHoleAreaRatio: number;
  readonly maxConsecutiveTrueHoleFrames: number;
  readonly reason:
    | "normal-visible-edge"
    | "large-delta-no-overlap"
    | "cache-cold"
    | "content-incompatible";
};

type RetainedMotionContinuityReason = RetainedMotionContinuityProof["reason"];

type RetainedVisibleCoverageProof = {
  readonly compatibleCoverageRects: readonly GpuRect[];
  readonly exactCoverageRects: readonly GpuRect[];
  readonly fidelityState: RetainedFidelityState;
  readonly impossibleRects: readonly GpuRect[];
  readonly rejectedStaleRects: readonly {
    readonly reason: RetainedCompatibilityRejectReason;
    readonly rect: GpuRect;
  }[];
  readonly rejectedPreparedFrameIds: readonly RetainedFrameId[];
  readonly trueHoleRects: readonly GpuRect[];
  readonly visibleContentRects: readonly GpuRect[];
};

type PublishedFrameDiagnostics = {
  readonly activeIslandTransaction: NativeIslandPublicationTransaction;
  readonly compatiblePageCount: number;
  readonly continuityProof: RetainedMotionContinuityProof;
  readonly coverageReadiness: CoverageReadiness;
  readonly desiredScrollRevision: number;
  readonly exactPageCount: number;
  readonly fidelityReadiness: RetainedFidelityState;
  readonly lastRejectedPreparedFrameId: RetainedFrameId | null;
  readonly publishedPreparedFrameId: RetainedFrameId;
  readonly rejectedFrameCount: number;
  readonly refinementPageCount: number;
  readonly trueHoleRectCount: number;
};

export type RetainedDisplayFrame = {
  readonly activeIslandRects: readonly PublishedNativeIslandRect[];
  readonly coverageProof: RetainedVisibleCoverageProof;
  readonly diagnostics: PublishedFrameDiagnostics;
  readonly compatibleDrawRegions: readonly PublishedRetainedCompatibleDrawRegion[];
  readonly drawRegions: readonly PublishedRetainedDrawRegion[];
  readonly flatSurfaces: readonly HtmlSurfaceFlatVisual[];
  readonly hitIndex: PublishedRetainedHitIndex;
  readonly id: RetainedFrameId;
  readonly pageFrame: RetainedPageFrame;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
};

type RetainedFrameTransaction = {
  readonly nowMs?: number | undefined;
  readonly prepared: RetainedDisplayFrameInput;
  readonly previous: RetainedDisplayFrame | null;
};

export function createRetainedDisplayFrameInput({
  pageFrame,
  retainedRuntimeFrame,
}: {
  readonly pageFrame: RetainedPageFrame;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
}): RetainedDisplayFrameInput {
  return Object.freeze({
    id: retainedRuntimeFrame.frameId,
    motionFrame: Object.freeze({
      ...retainedRuntimeFrame.input,
      frameId: retainedRuntimeFrame.frameId,
    }),
    pageFrame,
    retainedRuntimeFrame,
  });
}

export function publishRetainedDisplayFrame({
  nowMs = 0,
  prepared,
  previous,
}: RetainedFrameTransaction): RetainedDisplayFrame {
  void nowMs;
  const proof = createVisibleCoverageProof({
    prepared,
    previous,
  });
  if (proof.trueHoleRects.length > 0) {
    throw new Error(
      `Retained display frame publication requires committed visual epoch coverage; ${proof.trueHoleRects.length} true-hole rects remained.`,
    );
  }
  return createComposedRetainedDisplayFrame({
    coverageReadiness: "covered",
    diagnosticsPrevious: previous,
    prepared,
    proof,
  });
}

function createComposedRetainedDisplayFrame({
  coverageReadiness,
  diagnosticsPrevious,
  prepared,
  proof,
}: {
  readonly coverageReadiness: CoverageReadiness;
  readonly diagnosticsPrevious: RetainedDisplayFrame | null;
  readonly prepared: RetainedDisplayFrameInput;
  readonly proof: RetainedVisibleCoverageProof;
}): RetainedDisplayFrame {
  const compatibleDrawRegions = prepared.pageFrame.drawRegions.filter(
    (region): region is PublishedRetainedCompatibleDrawRegion =>
      region.coverageKind === "compatible",
  );
  const exactPageCount = prepared.pageFrame.drawRegions.filter(
    (region) => region.coverageKind === "exact",
  ).length;
  const desiredActiveIslandRects = createPublishedNativeIslandRects(
    prepared.retainedRuntimeFrame,
  );
  const activeIslandRects = desiredActiveIslandRects;
  const activeIslandTransaction = resolveNativeIslandPublicationTransaction({
    blockedByCoverage: false,
    desiredIslandIds: prepared.retainedRuntimeFrame.input.activeNativeIslandIds,
    previousIslandIds: getPublishedNativeIslandIds(diagnosticsPrevious),
    publishedIslandIds: activeIslandRects.map((island) => island.id),
  });
  return Object.freeze({
    activeIslandRects,
    coverageProof: proof,
    diagnostics: Object.freeze({
      activeIslandTransaction,
      compatiblePageCount: compatibleDrawRegions.length,
      continuityProof: createRetainedMotionContinuityProof({
        prepared,
        previous: diagnosticsPrevious,
        proof,
      }),
      coverageReadiness,
      desiredScrollRevision: prepared.retainedRuntimeFrame.input.scrollRevision,
      exactPageCount,
      fidelityReadiness: proof.fidelityState,
      lastRejectedPreparedFrameId: null,
      publishedPreparedFrameId: prepared.id,
      rejectedFrameCount:
        diagnosticsPrevious?.diagnostics.rejectedFrameCount ?? 0,
      refinementPageCount: prepared.pageFrame.refinementPageCount,
      trueHoleRectCount: proof.trueHoleRects.length,
    }),
    compatibleDrawRegions: Object.freeze(compatibleDrawRegions),
    drawRegions: prepared.pageFrame.drawRegions,
    flatSurfaces: prepared.pageFrame.flatSurfaces,
    hitIndex: Object.freeze({
      retainedRuntimeFrame: prepared.retainedRuntimeFrame,
    }),
    id: prepared.id,
    pageFrame: prepared.pageFrame,
    retainedRuntimeFrame: prepared.retainedRuntimeFrame,
  });
}

function getPublishedNativeIslandIds(
  frame: RetainedDisplayFrame | null,
): readonly string[] {
  return frame?.activeIslandRects.map((island) => island.id) ?? [];
}

function createVisibleCoverageProof({
  prepared,
  previous,
}: {
  readonly prepared: RetainedDisplayFrameInput;
  readonly previous: RetainedDisplayFrame | null;
}): RetainedVisibleCoverageProof {
  const compatibleCoverageRects = freezeRects(
    prepared.pageFrame.drawRegions
      .filter((region) => region.coverageKind === "compatible")
      .map((region) => region.sampleRectCss),
  );
  const exactCoverageRects = freezeRects(
    prepared.pageFrame.drawRegions
      .filter((region) => region.coverageKind === "exact")
      .map((region) => region.sampleRectCss),
  );
  const trueHoleRects = freezeRects(prepared.pageFrame.trueHoleRectsCss);
  const visibleContentRects = freezeRects(
    prepared.pageFrame.visibleRegionTargets.map((target) => target.contentRect),
  );
  return Object.freeze({
    compatibleCoverageRects,
    exactCoverageRects,
    fidelityState: prepared.pageFrame.fidelityState,
    impossibleRects: Object.freeze([]),
    rejectedStaleRects: Object.freeze(
      prepared.pageFrame.rejectedStaleRects.map((entry) =>
        Object.freeze({
          reason: entry.reason,
          rect: Object.freeze({ ...entry.rect }),
        }),
      ),
    ),
    rejectedPreparedFrameIds: Object.freeze([
      ...(previous?.coverageProof.rejectedPreparedFrameIds ?? []),
    ]),
    trueHoleRects,
    visibleContentRects,
  });
}

function createRetainedMotionContinuityProof({
  prepared,
  previous,
  proof,
}: {
  readonly prepared: RetainedDisplayFrameInput;
  readonly previous: RetainedDisplayFrame | null;
  readonly proof: RetainedVisibleCoverageProof;
}): RetainedMotionContinuityProof {
  const reason = resolveRetainedMotionContinuityReason({
    trueHoleRects: proof.trueHoleRects,
    prepared,
    previous,
    visibleRects: proof.visibleContentRects,
  });
  const previousVisibleRects =
    previous?.coverageProof.visibleContentRects ?? [];
  const visibleOverlapRects = intersectRectSets(
    previousVisibleRects,
    proof.visibleContentRects,
  );
  const visibleOverlapArea = rectSetArea(visibleOverlapRects);
  const coveredRects = [
    ...proof.exactCoverageRects,
    ...proof.compatibleCoverageRects,
  ];
  const overlapCoveredArea = rectSetArea(
    intersectRectSets(visibleOverlapRects, coveredRects),
  );
  const trueHoleArea = rectSetArea(proof.trueHoleRects);
  const visibleArea = rectSetArea(proof.visibleContentRects);
  const maxConsecutiveTrueHoleFrames =
    getRetainedMotionConsecutiveTrueHoleFrameCount({
      trueHoleArea,
      previous,
    });
  assertRetainedMotionContinuityCoveredOverlap({
    overlapCoveredArea,
    trueHoleArea,
    previous,
    reason,
    visibleOverlapArea,
  });
  return Object.freeze({
    maxConsecutiveTrueHoleFrames,
    overlapCoveredAreaCssPx: overlapCoveredArea,
    trueHoleAreaCssPx: trueHoleArea,
    trueHoleAreaRatio: ratioOrZero(trueHoleArea, visibleArea),
    reason,
  });
}

function getRetainedMotionConsecutiveTrueHoleFrameCount({
  trueHoleArea,
  previous,
}: {
  readonly trueHoleArea: number;
  readonly previous: RetainedDisplayFrame | null;
}): number {
  if (trueHoleArea <= 0) {
    return 0;
  }
  return (
    (previous?.diagnostics.continuityProof.maxConsecutiveTrueHoleFrames ?? 0) +
    1
  );
}

function assertRetainedMotionContinuityCoveredOverlap({
  overlapCoveredArea,
  trueHoleArea,
  previous,
  reason,
  visibleOverlapArea,
}: {
  readonly overlapCoveredArea: number;
  readonly trueHoleArea: number;
  readonly previous: RetainedDisplayFrame | null;
  readonly reason: RetainedMotionContinuityReason;
  readonly visibleOverlapArea: number;
}) {
  if (
    shouldAssertRetainedMotionContinuityCoveredOverlap({
      overlapCoveredArea,
      trueHoleArea,
      previous,
      reason,
      visibleOverlapArea,
    })
  ) {
    throw new Error(
      "Retained scroll motion has previous visible overlap but no compatible covered content.",
    );
  }
}

function shouldAssertRetainedMotionContinuityCoveredOverlap({
  overlapCoveredArea,
  trueHoleArea,
  previous,
  reason,
  visibleOverlapArea,
}: {
  readonly overlapCoveredArea: number;
  readonly trueHoleArea: number;
  readonly previous: RetainedDisplayFrame | null;
  readonly reason: RetainedMotionContinuityReason;
  readonly visibleOverlapArea: number;
}): boolean {
  return (
    isRetainedDisplayFrameTestRuntime() &&
    Boolean(previous?.pageFrame.drawQuadCount) &&
    reason === "normal-visible-edge" &&
    visibleOverlapArea > 0 &&
    overlapCoveredArea <= 0 &&
    trueHoleArea > 0
  );
}

function ratioOrZero(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function resolveRetainedMotionContinuityReason({
  trueHoleRects,
  prepared,
  previous,
  visibleRects,
}: {
  readonly trueHoleRects: readonly GpuRect[];
  readonly prepared: RetainedDisplayFrameInput;
  readonly previous: RetainedDisplayFrame | null;
  readonly visibleRects: readonly GpuRect[];
}): RetainedMotionContinuityProof["reason"] {
  if (trueHoleRects.length === 0) {
    return "normal-visible-edge";
  }
  if (!previous) {
    return "cache-cold";
  }
  if (!hasCompatibleRetainedContentIdentity(previous, prepared)) {
    return "content-incompatible";
  }
  const previousVisibleRects = previous.coverageProof.visibleContentRects;
  const visibleOverlapArea = rectSetArea(
    intersectRectSets(previousVisibleRects, visibleRects),
  );
  return visibleOverlapArea > 0
    ? "normal-visible-edge"
    : "large-delta-no-overlap";
}

function hasCompatibleRetainedContentIdentity(
  previous: RetainedDisplayFrame,
  prepared: RetainedDisplayFrameInput,
): boolean {
  return prepared.pageFrame.visibleRegionTargets.some((current) =>
    previous.pageFrame.visibleRegionTargets.some(
      (published) =>
        published.manifest.surfaceId === current.manifest.surfaceId &&
        published.manifest.documentId === current.manifest.documentId &&
        published.manifest.themeGeneration ===
          current.manifest.themeGeneration &&
        published.manifest.contentVersion === current.manifest.contentVersion,
    ),
  );
}

function intersectRectSets(
  leftRects: readonly GpuRect[],
  rightRects: readonly GpuRect[],
): readonly GpuRect[] {
  const intersections: GpuRect[] = [];
  for (const left of leftRects) {
    for (const right of rightRects) {
      const intersection = intersectRects(left, right);
      if (intersection) {
        intersections.push(intersection);
      }
    }
  }
  return intersections;
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

function rectSetArea(rects: readonly GpuRect[]): number {
  return rects.reduce((total, rect) => total + rect.width * rect.height, 0);
}

function isRetainedDisplayFrameTestRuntime(): boolean {
  return typeof process !== "undefined" && process.env.NODE_ENV === "test";
}

function freezeRects(rects: readonly GpuRect[]): readonly GpuRect[] {
  return Object.freeze(rects.map((rect) => Object.freeze({ ...rect })));
}

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
import type { RetainedTextureBudget } from "./retainedTextureBudget";
import type { RetainedTexturePageDrawQuad } from "./retainedTexturePageGrid";
import type { RetainedTexturePageDescriptor } from "./retainedTexturePages";
import type { GpuRect } from "./viewportMath";

export type {
  NativeIslandPublicationTransaction,
  PublishedNativeIslandRect,
  RetainedTextureBudget,
};

export type RetainedFrameId = number;
export type RetainedSourceId = string;
export type RetainedSourceRevision = number;
export type RetainedPageId = string;
export type RetainedScaleBucket = number;

export type CoverageReadiness = "covered" | "true-holes" | "initial-loading";

export type RetainedMotionFrame = GpuRetainedRuntimeFrame["input"] & {
  readonly frameId: RetainedFrameId;
};

export type RetainedContentSnapshotFrame = {
  readonly id: RetainedFrameId;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
};

export type RetainedPageFrame = RetainedContentTexturePagePreparedFrame;

export type RetainedDisplayFrameInput = RetainedContentSnapshotFrame & {
  readonly motionFrame: RetainedMotionFrame;
  readonly pageFrame: RetainedPageFrame;
};

export type PublishedRetainedPage =
  RetainedTexturePageDrawQuad<RetainedContentTextureResources>;

export type PublishedRetainedCompatiblePage = PublishedRetainedPage & {
  readonly coverageKind: "compatible";
};

export type PublishedRetainedHitIndex = {
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
};

export type RetainedMotionContinuityProof = {
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

export type RetainedVisibleCoverageProof = {
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

export type PublishedFrameDiagnostics = {
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
  readonly compatiblePages: readonly PublishedRetainedCompatiblePage[];
  readonly flatSurfaces: readonly HtmlSurfaceFlatVisual[];
  readonly hitIndex: PublishedRetainedHitIndex;
  readonly id: RetainedFrameId;
  readonly pageFrame: RetainedPageFrame;
  readonly pages: readonly PublishedRetainedPage[];
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
};

export type RetainedFrameTransaction = {
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
  const proof = createVisibleCoverageProof({
    prepared,
    previous,
  });
  if (proof.trueHoleRects.length === 0) {
    return createComposedRetainedDisplayFrame({
      coverageReadiness: "covered",
      diagnosticsPrevious: previous,
      prepared,
      proof,
    });
  }
  if (!previous) {
    return createComposedRetainedDisplayFrame({
      coverageReadiness: "initial-loading",
      diagnosticsPrevious: null,
      prepared,
      proof,
    });
  }
  void nowMs;
  return createComposedRetainedDisplayFrame({
    coverageReadiness: "true-holes",
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
  const compatiblePages = prepared.pageFrame.drawQuads.filter(
    (page): page is PublishedRetainedCompatiblePage =>
      page.coverageKind === "compatible",
  );
  const exactPageCount = prepared.pageFrame.drawQuads.filter(
    (page) => page.coverageKind === "exact",
  ).length;
  const desiredActiveIslandRects = createPublishedNativeIslandRects(
    prepared.retainedRuntimeFrame,
  );
  const blockedPassiveDetachByCoverage =
    proof.trueHoleRects.length > 0 &&
    desiredActiveIslandRects.length === 0 &&
    Boolean(diagnosticsPrevious?.activeIslandRects.length);
  const activeIslandRects = blockedPassiveDetachByCoverage
    ? diagnosticsPrevious?.activeIslandRects ?? []
    : desiredActiveIslandRects;
  const activeIslandTransaction = resolveNativeIslandPublicationTransaction({
    blockedByCoverage: blockedPassiveDetachByCoverage,
    desiredIslandIds: prepared.retainedRuntimeFrame.input.activeNativeIslandIds,
    previousIslandIds: getPublishedNativeIslandIds(diagnosticsPrevious),
    publishedIslandIds: activeIslandRects.map((island) => island.id),
  });
  return Object.freeze({
    activeIslandRects,
    coverageProof: proof,
    diagnostics: Object.freeze({
      activeIslandTransaction,
      compatiblePageCount: compatiblePages.length,
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
    compatiblePages: Object.freeze(compatiblePages),
    flatSurfaces: prepared.pageFrame.flatSurfaces,
    hitIndex: Object.freeze({
      retainedRuntimeFrame: prepared.retainedRuntimeFrame,
    }),
    id: prepared.id,
    pageFrame: prepared.pageFrame,
    pages: prepared.pageFrame.drawQuads,
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
    prepared.pageFrame.drawQuads
      .filter((quad) => quad.coverageKind === "compatible")
      .map((quad) => quad.sampleRectCss),
  );
  const exactCoverageRects = freezeRects(
    prepared.pageFrame.drawQuads
      .filter((quad) => quad.coverageKind === "exact")
      .map((quad) => quad.sampleRectCss),
  );
  const trueHoleRects = freezeRects(prepared.pageFrame.trueHoleRectsCss);
  const visibleContentRects = freezeRects(
    prepared.pageFrame.targetDescriptors.map(
      (descriptor: RetainedTexturePageDescriptor) => descriptor.sourceRectCss,
    ),
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
  return prepared.pageFrame.targetDescriptors.some((current) =>
    previous.pageFrame.targetDescriptors.some(
      (published) =>
        published.surfaceId === current.surfaceId &&
        published.sourceKey === current.sourceKey &&
        published.sourceVersion === current.sourceVersion &&
        published.contentVersion === current.contentVersion,
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

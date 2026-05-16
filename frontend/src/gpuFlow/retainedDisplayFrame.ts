import type { HtmlSurfaceFlatVisual } from "./htmlSurfaces/visualScene";
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

export type CoverageReadiness =
  | "complete"
  | "pending-visible-strips"
  | "explicit-loading-state";

export type TextureReadiness = "ready" | "fallback" | "missing";

export type ScrollPublicationMode =
  | "publish-motion-frame"
  | "publish-motion-frame-with-pending-strips"
  | "publish-initial-loading-state"
  | "reject-content-snapshot";

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

export type PublishedRetainedFallbackPage = PublishedRetainedPage & {
  readonly fallback: true;
};

export type PublishedRetainedHitIndex = {
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
};

export type RetainedPendingStrip = {
  readonly rect: GpuRect;
  readonly reason:
    | "normal-edge-strip"
    | "large-delta-no-overlap"
    | "cache-cold"
    | "content-incompatible";
};

export type RetainedMotionContinuityProof = {
  readonly overlapCoveredAreaCssPx: number;
  readonly pendingAreaCssPx: number;
  readonly pendingAreaRatio: number;
  readonly maxConsecutivePendingFrames: number;
  readonly reason:
    | "normal-edge-strip"
    | "large-delta-no-overlap"
    | "cache-cold"
    | "content-incompatible";
};

export type RetainedVisibleCoverageProof = {
  readonly coveredRects: readonly GpuRect[];
  readonly exactRects: readonly GpuRect[];
  readonly fallbackRects: readonly GpuRect[];
  readonly impossibleRects: readonly GpuRect[];
  readonly missingRects: readonly GpuRect[];
  readonly pendingStrips: readonly RetainedPendingStrip[];
  readonly rejectedPreparedFrameIds: readonly RetainedFrameId[];
  readonly visibleRects: readonly GpuRect[];
};

export type PublishedFrameDiagnostics = {
  readonly activeIslandTransaction: NativeIslandPublicationTransaction;
  readonly continuityProof: RetainedMotionContinuityProof;
  readonly coverageReadiness: CoverageReadiness;
  readonly desiredScrollRevision: number;
  readonly fallbackPageCount: number;
  readonly lastRejectedPreparedFrameId: RetainedFrameId | null;
  readonly missingPageCount: number;
  readonly publishedPreparedFrameId: RetainedFrameId;
  readonly rejectedFrameCount: number;
  readonly scrollPublicationMode: ScrollPublicationMode;
  readonly textureReadiness: TextureReadiness;
  readonly uncoveredRectCount: number;
};

export type RetainedDisplayFrame = {
  readonly activeIslandRects: readonly PublishedNativeIslandRect[];
  readonly coverageProof: RetainedVisibleCoverageProof;
  readonly diagnostics: PublishedFrameDiagnostics;
  readonly fallbackPages: readonly PublishedRetainedFallbackPage[];
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
  if (proof.missingRects.length === 0) {
    return createComposedRetainedDisplayFrame({
      coverageReadiness: "complete",
      diagnosticsPrevious: previous,
      prepared,
      proof,
      scrollPublicationMode: "publish-motion-frame",
      textureReadiness:
        prepared.pageFrame.fallbackDrawQuadCount > 0 ? "fallback" : "ready",
    });
  }
  if (!previous) {
    return createComposedRetainedDisplayFrame({
      coverageReadiness: "explicit-loading-state",
      diagnosticsPrevious: null,
      prepared,
      proof,
      scrollPublicationMode: "publish-initial-loading-state",
      textureReadiness: "missing",
    });
  }
  void nowMs;
  return createComposedRetainedDisplayFrame({
    coverageReadiness: "pending-visible-strips",
    diagnosticsPrevious: previous,
    prepared,
    proof,
    scrollPublicationMode: "publish-motion-frame-with-pending-strips",
    textureReadiness:
      prepared.pageFrame.drawQuadCount > 0 ? "fallback" : "missing",
  });
}

function createComposedRetainedDisplayFrame({
  coverageReadiness,
  diagnosticsPrevious,
  prepared,
  proof,
  scrollPublicationMode,
  textureReadiness,
}: {
  readonly coverageReadiness: CoverageReadiness;
  readonly diagnosticsPrevious: RetainedDisplayFrame | null;
  readonly prepared: RetainedDisplayFrameInput;
  readonly proof: RetainedVisibleCoverageProof;
  readonly scrollPublicationMode: ScrollPublicationMode;
  readonly textureReadiness: TextureReadiness;
}): RetainedDisplayFrame {
  const fallbackPages = prepared.pageFrame.drawQuads.filter(
    (page): page is PublishedRetainedFallbackPage => page.fallback,
  );
  const desiredActiveIslandRects = createPublishedNativeIslandRects(
    prepared.retainedRuntimeFrame,
  );
  const blockedPassiveDetachByCoverage =
    proof.missingRects.length > 0 &&
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
      continuityProof: createRetainedMotionContinuityProof({
        prepared,
        previous: diagnosticsPrevious,
        proof,
      }),
      coverageReadiness,
      desiredScrollRevision: prepared.retainedRuntimeFrame.input.scrollRevision,
      fallbackPageCount: fallbackPages.length,
      lastRejectedPreparedFrameId: null,
      missingPageCount: prepared.pageFrame.missingPageCount,
      publishedPreparedFrameId: prepared.id,
      rejectedFrameCount:
        diagnosticsPrevious?.diagnostics.rejectedFrameCount ?? 0,
      scrollPublicationMode,
      textureReadiness,
      uncoveredRectCount: prepared.pageFrame.uncoveredRectCount,
    }),
    fallbackPages: Object.freeze(fallbackPages),
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
  const coveredRects = freezeRects(
    prepared.pageFrame.drawQuads.map((quad) => quad.sampleRectCss),
  );
  const fallbackRects = freezeRects(
    prepared.pageFrame.drawQuads
      .filter((quad) => quad.fallback)
      .map((quad) => quad.sampleRectCss),
  );
  const exactRects = freezeRects(
    prepared.pageFrame.drawQuads
      .filter((quad) => !quad.fallback)
      .map((quad) => quad.sampleRectCss),
  );
  const missingRects = freezeRects(prepared.pageFrame.uncoveredRectsCss);
  const visibleRects = freezeRects(
    prepared.pageFrame.targetDescriptors.map(
      (descriptor: RetainedTexturePageDescriptor) => descriptor.sourceRectCss,
    ),
  );
  const reason = resolveRetainedMotionContinuityReason({
    coveredRects,
    missingRects,
    prepared,
    previous,
    visibleRects,
  });
  return Object.freeze({
    coveredRects,
    exactRects,
    fallbackRects,
    impossibleRects: Object.freeze([]),
    missingRects,
    pendingStrips: Object.freeze(
      missingRects.map((rect) => Object.freeze({ reason, rect })),
    ),
    rejectedPreparedFrameIds: Object.freeze([
      ...(previous?.coverageProof.rejectedPreparedFrameIds ?? []),
    ]),
    visibleRects,
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
  const reason =
    proof.pendingStrips[0]?.reason ??
    resolveRetainedMotionContinuityReason({
      coveredRects: proof.coveredRects,
      missingRects: proof.missingRects,
      prepared,
      previous,
      visibleRects: proof.visibleRects,
    });
  const previousVisibleRects = previous?.coverageProof.visibleRects ?? [];
  const visibleOverlapRects = intersectRectSets(
    previousVisibleRects,
    proof.visibleRects,
  );
  const visibleOverlapArea = rectSetArea(visibleOverlapRects);
  const overlapCoveredArea = rectSetArea(
    intersectRectSets(visibleOverlapRects, proof.coveredRects),
  );
  const pendingArea = rectSetArea(proof.missingRects);
  const visibleArea = rectSetArea(proof.visibleRects);
  const maxConsecutivePendingFrames =
    getRetainedMotionConsecutivePendingFrameCount({
      pendingArea,
      previous,
    });
  assertRetainedMotionContinuityCoveredOverlap({
    overlapCoveredArea,
    pendingArea,
    previous,
    reason,
    visibleOverlapArea,
  });
  return Object.freeze({
    maxConsecutivePendingFrames,
    overlapCoveredAreaCssPx: overlapCoveredArea,
    pendingAreaCssPx: pendingArea,
    pendingAreaRatio: ratioOrZero(pendingArea, visibleArea),
    reason,
  });
}

function getRetainedMotionConsecutivePendingFrameCount({
  pendingArea,
  previous,
}: {
  readonly pendingArea: number;
  readonly previous: RetainedDisplayFrame | null;
}): number {
  if (pendingArea <= 0) {
    return 0;
  }
  return (
    (previous?.diagnostics.continuityProof.maxConsecutivePendingFrames ?? 0) +
    1
  );
}

function assertRetainedMotionContinuityCoveredOverlap({
  overlapCoveredArea,
  pendingArea,
  previous,
  reason,
  visibleOverlapArea,
}: {
  readonly overlapCoveredArea: number;
  readonly pendingArea: number;
  readonly previous: RetainedDisplayFrame | null;
  readonly reason: RetainedMotionContinuityReason;
  readonly visibleOverlapArea: number;
}) {
  if (
    shouldAssertRetainedMotionContinuityCoveredOverlap({
      overlapCoveredArea,
      pendingArea,
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
  pendingArea,
  previous,
  reason,
  visibleOverlapArea,
}: {
  readonly overlapCoveredArea: number;
  readonly pendingArea: number;
  readonly previous: RetainedDisplayFrame | null;
  readonly reason: RetainedMotionContinuityReason;
  readonly visibleOverlapArea: number;
}): boolean {
  return (
    isRetainedDisplayFrameTestRuntime() &&
    Boolean(previous?.pageFrame.drawQuadCount) &&
    reason === "normal-edge-strip" &&
    visibleOverlapArea > 0 &&
    overlapCoveredArea <= 0 &&
    pendingArea > 0
  );
}

function ratioOrZero(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function resolveRetainedMotionContinuityReason({
  missingRects,
  prepared,
  previous,
  visibleRects,
}: {
  readonly coveredRects: readonly GpuRect[];
  readonly missingRects: readonly GpuRect[];
  readonly prepared: RetainedDisplayFrameInput;
  readonly previous: RetainedDisplayFrame | null;
  readonly visibleRects: readonly GpuRect[];
}): RetainedMotionContinuityProof["reason"] {
  if (missingRects.length === 0) {
    return "normal-edge-strip";
  }
  if (!previous) {
    return "cache-cold";
  }
  if (!hasCompatibleRetainedContentIdentity(previous, prepared)) {
    return "content-incompatible";
  }
  const previousVisibleRects = previous.coverageProof.visibleRects;
  const visibleOverlapArea = rectSetArea(
    intersectRectSets(previousVisibleRects, visibleRects),
  );
  return visibleOverlapArea > 0
    ? "normal-edge-strip"
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

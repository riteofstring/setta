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
import {
  createRetainedColdPlaceholderSurfaceTransaction,
  createRetainedSurfaceTransactionSnapshot,
} from "./surfaceCompositor/retainedSurfaceActorAdapter";
import type { SurfaceActorSnapshot } from "./surfaceCompositor/surfaceActor";
import type { SurfaceTransactionHoldDiagnostics } from "./surfaceCompositor/surfaceDiagnostics";
import {
  resolveSurfaceTransaction,
  type SurfaceDisplayTransaction,
} from "./surfaceCompositor/surfaceTransaction";
import type { GpuRect } from "./viewportMath";

type RetainedFrameId = number;

type CoverageReadiness = "cold-placeholder" | "covered" | "held-previous";

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
  readonly holdDiagnostics: SurfaceTransactionHoldDiagnostics | null;
  readonly lastRejectedPreparedFrameId: RetainedFrameId | null;
  readonly publishedAtMs: number;
  readonly publishedPreparedFrameId: RetainedFrameId;
  readonly rejectedFrameCount: number;
  readonly refinementPageCount: number;
  readonly transactionOutcome:
    | "hold-previous"
    | "publish-cold-placeholder"
    | "publish-compatible"
    | "publish-exact";
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
  readonly surfaceActorSnapshots: readonly SurfaceActorSnapshot[];
  readonly surfaceTransaction: SurfaceDisplayTransaction;
};

type RetainedFrameTransaction = {
  readonly allowColdPlaceholder?: boolean | undefined;
  readonly nowMs?: number | undefined;
  readonly prepared: RetainedDisplayFrameInput;
  readonly previous: RetainedDisplayFrame | null;
};

type RetainedDisplayFrameOutcome =
  | { readonly frame: RetainedDisplayFrame; readonly kind: "publish-exact" }
  | {
      readonly frame: RetainedDisplayFrame;
      readonly kind: "publish-compatible";
    }
  | {
      readonly diagnostics: SurfaceTransactionHoldDiagnostics;
      readonly frame: RetainedDisplayFrame;
      readonly kind: "hold-previous";
      readonly previousFrameId: RetainedFrameId;
      readonly reason: "coverage-missing";
    }
  | {
      readonly kind: "block-cold-first-coverage";
      readonly reason: "coverage-missing";
    }
  | {
      readonly frame: RetainedDisplayFrame;
      readonly kind: "publish-cold-placeholder";
      readonly reason: "coverage-missing";
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
  const outcome = resolveRetainedDisplayFrameTransaction({
    nowMs,
    prepared,
    previous,
  });
  if (
    outcome.kind === "publish-exact" ||
    outcome.kind === "publish-compatible" ||
    outcome.kind === "publish-cold-placeholder" ||
    outcome.kind === "hold-previous"
  ) {
    return outcome.frame;
  }
  throw new Error(
    "Retained display frame publication requires committed visual epoch coverage.",
  );
}

export function resolveRetainedDisplayFrameTransaction({
  allowColdPlaceholder = false,
  nowMs = 0,
  prepared,
  previous,
}: RetainedFrameTransaction): RetainedDisplayFrameOutcome {
  const proof = createVisibleCoverageProof({
    prepared,
    previous,
  });
  const surfaceSnapshot = createRetainedSurfaceTransactionSnapshot({
    id: `retained:${prepared.id}`,
    nowMs,
    pageFrame: prepared.pageFrame,
    retainedRuntimeFrame: prepared.retainedRuntimeFrame,
  });
  const surfaceOutcome = resolveSurfaceTransaction({
    coldPlaceholderAllowed: allowColdPlaceholder,
    desired: surfaceSnapshot.transaction,
    nowMs,
    previous: previous?.surfaceTransaction ?? null,
  });
  return resolveRetainedSurfaceTransactionOutcome({
    nowMs,
    prepared,
    previous,
    proof,
    surfaceActorSnapshots: surfaceSnapshot.actorSnapshots,
    surfaceOutcome,
  });
}

function resolveRetainedSurfaceTransactionOutcome({
  nowMs,
  prepared,
  previous,
  proof,
  surfaceActorSnapshots,
  surfaceOutcome,
}: {
  readonly nowMs: number;
  readonly prepared: RetainedDisplayFrameInput;
  readonly previous: RetainedDisplayFrame | null | undefined;
  readonly proof: RetainedVisibleCoverageProof;
  readonly surfaceActorSnapshots: readonly SurfaceActorSnapshot[];
  readonly surfaceOutcome: ReturnType<typeof resolveSurfaceTransaction>;
}): RetainedDisplayFrameOutcome {
  switch (surfaceOutcome.kind) {
    case "hold-previous":
      return createHeldRetainedDisplayFrameOutcome({
        diagnostics: surfaceOutcome.diagnostics,
        prepared,
        previous,
      });
    case "publish-cold-placeholder":
      return {
        frame: createColdPlaceholderRetainedDisplayFrame({
          nowMs,
          prepared,
          proof,
        }),
        kind: "publish-cold-placeholder",
        reason: "coverage-missing",
      };
    case "block-cold-first-coverage":
      return {
        kind: "block-cold-first-coverage",
        reason: "coverage-missing",
      };
    case "publish-compatible":
    case "publish-exact":
      return createPublishedRetainedDisplayFrameOutcome({
        nowMs,
        prepared,
        previous,
        proof,
        surfaceActorSnapshots,
        surfaceTransaction: surfaceOutcome.transaction,
      });
  }
}

function createHeldRetainedDisplayFrameOutcome({
  diagnostics,
  prepared,
  previous,
}: {
  readonly diagnostics: SurfaceTransactionHoldDiagnostics;
  readonly prepared: RetainedDisplayFrameInput;
  readonly previous: RetainedDisplayFrame | null | undefined;
}): Extract<RetainedDisplayFrameOutcome, { readonly kind: "hold-previous" }> {
  if (!previous) {
    throw new Error(
      "Retained surface transaction hold requires a previous display frame.",
    );
  }
  return {
    diagnostics,
    frame: createHeldRetainedDisplayFrame({
      diagnostics,
      prepared,
      previous,
    }),
    kind: "hold-previous",
    previousFrameId: previous.id,
    reason: "coverage-missing",
  };
}

function createPublishedRetainedDisplayFrameOutcome({
  nowMs,
  prepared,
  previous,
  proof,
  surfaceActorSnapshots,
  surfaceTransaction,
}: {
  readonly nowMs: number;
  readonly prepared: RetainedDisplayFrameInput;
  readonly previous: RetainedDisplayFrame | null | undefined;
  readonly proof: RetainedVisibleCoverageProof;
  readonly surfaceActorSnapshots: readonly SurfaceActorSnapshot[];
  readonly surfaceTransaction: SurfaceDisplayTransaction;
}): Extract<
  RetainedDisplayFrameOutcome,
  { readonly kind: "publish-compatible" | "publish-exact" }
> {
  const transactionOutcome = hasCompatibleRetainedDrawRegions(prepared.pageFrame)
    ? "publish-compatible"
    : "publish-exact";
  const frame = createComposedRetainedDisplayFrame({
    coverageReadiness: "covered",
    diagnosticsPrevious: previous,
    holdDiagnostics: null,
    nowMs,
    prepared,
    proof,
    surfaceActorSnapshots,
    surfaceTransaction,
    transactionOutcome,
  });
  return transactionOutcome === "publish-compatible"
    ? { frame, kind: "publish-compatible" }
    : { frame, kind: "publish-exact" };
}

function createComposedRetainedDisplayFrame({
  coverageReadiness,
  diagnosticsPrevious,
  holdDiagnostics,
  nowMs,
  prepared,
  proof,
  surfaceActorSnapshots,
  surfaceTransaction,
  transactionOutcome,
}: {
  readonly coverageReadiness: CoverageReadiness;
  readonly diagnosticsPrevious: RetainedDisplayFrame | null;
  readonly holdDiagnostics: SurfaceTransactionHoldDiagnostics | null;
  readonly nowMs: number;
  readonly prepared: RetainedDisplayFrameInput;
  readonly proof: RetainedVisibleCoverageProof;
  readonly surfaceActorSnapshots: readonly SurfaceActorSnapshot[];
  readonly surfaceTransaction: SurfaceDisplayTransaction;
  readonly transactionOutcome: PublishedFrameDiagnostics["transactionOutcome"];
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
      holdDiagnostics,
      lastRejectedPreparedFrameId: null,
      publishedAtMs: nowMs,
      publishedPreparedFrameId: prepared.id,
      rejectedFrameCount:
        diagnosticsPrevious?.diagnostics.rejectedFrameCount ?? 0,
      refinementPageCount: prepared.pageFrame.refinementPageCount,
      transactionOutcome,
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
    surfaceActorSnapshots,
    surfaceTransaction,
  });
}

function createHeldRetainedDisplayFrame({
  diagnostics,
  prepared,
  previous,
}: {
  readonly diagnostics: SurfaceTransactionHoldDiagnostics;
  readonly prepared: RetainedDisplayFrameInput;
  readonly previous: RetainedDisplayFrame;
}): RetainedDisplayFrame {
  return Object.freeze({
    ...previous,
    diagnostics: Object.freeze({
      ...previous.diagnostics,
      coverageReadiness: "held-previous",
      desiredScrollRevision: prepared.retainedRuntimeFrame.input.scrollRevision,
      holdDiagnostics: diagnostics,
      rejectedFrameCount: previous.diagnostics.rejectedFrameCount + 1,
      transactionOutcome: "hold-previous",
    }),
  });
}

function createColdPlaceholderRetainedDisplayFrame({
  nowMs,
  prepared,
  proof,
}: {
  readonly nowMs: number;
  readonly prepared: RetainedDisplayFrameInput;
  readonly proof: RetainedVisibleCoverageProof;
}): RetainedDisplayFrame {
  const placeholderPageFrame: RetainedPageFrame = {
    ...prepared.pageFrame,
    compatibleDrawQuadCount: 0,
    drawRegions: [],
    drawQuadCount: 0,
    flatSurfaces: [],
    mergedDrawQuadCount: 0,
    trueHoleRectCount: 0,
    trueHoleRectsCss: [],
    trueHoleVisuals: [],
  };
  const surfaceSnapshot = createRetainedColdPlaceholderSurfaceTransaction({
    id: `retained:${prepared.id}:cold-placeholder`,
    nowMs,
    retainedRuntimeFrame: prepared.retainedRuntimeFrame,
  });
  return createComposedRetainedDisplayFrame({
    coverageReadiness: "cold-placeholder",
    diagnosticsPrevious: null,
    holdDiagnostics: null,
    nowMs,
    prepared: createRetainedDisplayFrameInput({
      pageFrame: placeholderPageFrame,
      retainedRuntimeFrame: prepared.retainedRuntimeFrame,
    }),
    proof: Object.freeze({
      ...proof,
      compatibleCoverageRects: Object.freeze([]),
      exactCoverageRects: Object.freeze([]),
      trueHoleRects: Object.freeze([]),
      visibleContentRects: Object.freeze([]),
    }),
    surfaceActorSnapshots: surfaceSnapshot.actorSnapshots,
    surfaceTransaction: surfaceSnapshot.transaction,
    transactionOutcome: "publish-cold-placeholder",
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

function hasCompatibleRetainedDrawRegions(
  pageFrame: RetainedPageFrame,
): boolean {
  return pageFrame.drawRegions.some(
    (region) => region.coverageKind === "compatible",
  );
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

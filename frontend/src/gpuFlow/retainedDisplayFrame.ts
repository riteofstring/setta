import type { HtmlSurfaceFlatVisual } from "./htmlSurfaces/visualScene";
import type {
  RetainedCompatibilityRejectReason,
  RetainedFidelityState,
} from "./retainedContentLifecycle";
import type { RetainedContentTexturePagePreparedFrame } from "./retainedContentTexturePageManager";
import type { RetainedContentTextureResources } from "./retainedContentTextureResources";
import {
  createPresentedNativeIslandRects,
  resolveNativeIslandPresentationTransaction,
  type NativeIslandPresentationTransaction,
  type PresentedNativeIslandRect,
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

type CoverageReadiness =
  | "candidate-blocked"
  | "cold-placeholder"
  | "covered"
  | "held-previous";

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

type PresentedRetainedDrawRegion =
  RetainedDrawRegion<RetainedContentTextureResources>;

type PresentedRetainedCompatibleDrawRegion = PresentedRetainedDrawRegion & {
  readonly coverageKind: "compatible";
};

type PresentedRetainedHitIndex = {
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

type PresentedFrameDiagnostics = {
  readonly activeIslandTransaction: NativeIslandPresentationTransaction;
  readonly compatiblePageCount: number;
  readonly continuityProof: RetainedMotionContinuityProof;
  readonly coverageReadiness: CoverageReadiness;
  readonly desiredScrollRevision: number;
  readonly domControlPlaneCompleteness: readonly RetainedDomControlPlaneCompletenessState[];
  readonly exactPageCount: number;
  readonly fidelityReadiness: RetainedFidelityState;
  readonly holdDiagnostics: SurfaceTransactionHoldDiagnostics | null;
  readonly lastRejectedPreparedFrameId: RetainedFrameId | null;
  readonly presentedAtMs: number;
  readonly presentedPreparedFrameId: RetainedFrameId;
  readonly rejectedFrameCount: number;
  readonly refinementPageCount: number;
  readonly transactionOutcome:
    | "hold-previous"
    | "present-cold-placeholder"
    | "present-compatible"
    | "present-exact";
  readonly trueHoleRectCount: number;
};

type RetainedDomControlPlaneCompletenessState = {
  readonly active: boolean;
  readonly blockingReasons: readonly string[];
  readonly controlId: string;
  readonly projected: boolean;
  readonly rowId: string;
  readonly sourceKey: string;
  readonly visibleNonempty: boolean;
};

export type RetainedDisplayFrame = {
  readonly activeIslandRects: readonly PresentedNativeIslandRect[];
  readonly coverageProof: RetainedVisibleCoverageProof;
  readonly diagnostics: PresentedFrameDiagnostics;
  readonly compatibleDrawRegions: readonly PresentedRetainedCompatibleDrawRegion[];
  readonly drawRegions: readonly PresentedRetainedDrawRegion[];
  readonly flatSurfaces: readonly HtmlSurfaceFlatVisual[];
  readonly hitIndex: PresentedRetainedHitIndex;
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

export type RetainedDisplayFrameOutcome =
  | { readonly frame: RetainedDisplayFrame; readonly kind: "present-exact" }
  | {
      readonly frame: RetainedDisplayFrame;
      readonly kind: "present-compatible";
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
      readonly kind: "present-cold-placeholder";
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

export function presentRetainedDisplayFrame({
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
    outcome.kind === "present-exact" ||
    outcome.kind === "present-compatible" ||
    outcome.kind === "present-cold-placeholder" ||
    outcome.kind === "hold-previous"
  ) {
    return outcome.frame;
  }
  throw new Error(
    "Retained display frame presentation requires committed visual epoch coverage.",
  );
}

export function createRetainedDisplayFrameCandidate({
  nowMs = 0,
  prepared,
  previous,
}: RetainedFrameTransaction): Extract<
  RetainedDisplayFrameOutcome,
  { readonly kind: "present-compatible" | "present-exact" }
> {
  const compatiblePrevious = getRetainedDisplayHoldCompatiblePrevious({
    prepared,
    previous,
  });
  const proof = createVisibleCoverageProof({
    prepared,
    previous: compatiblePrevious,
  });
  const surfaceSnapshot = createRetainedSurfaceTransactionSnapshot({
    id: `retained:${prepared.id}`,
    nowMs,
    pageFrame: prepared.pageFrame,
    retainedRuntimeFrame: prepared.retainedRuntimeFrame,
  });
  return createPresentedRetainedDisplayFrameOutcome({
    coverageReadiness:
      proof.trueHoleRects.length === 0 ? "covered" : "candidate-blocked",
    nowMs,
    prepared,
    previous: compatiblePrevious,
    proof,
    surfaceActorSnapshots: surfaceSnapshot.actorSnapshots,
    surfaceTransaction: surfaceSnapshot.transaction,
  });
}

export function resolveRetainedDisplayFrameTransaction({
  allowColdPlaceholder = false,
  nowMs = 0,
  prepared,
  previous,
}: RetainedFrameTransaction): RetainedDisplayFrameOutcome {
  const holdCompatiblePrevious = getRetainedDisplayHoldCompatiblePrevious({
    prepared,
    previous,
  });
  const proof = createVisibleCoverageProof({
    prepared,
    previous: holdCompatiblePrevious,
  });
  const surfaceSnapshot = createRetainedSurfaceTransactionSnapshot({
    id: `retained:${prepared.id}`,
    nowMs,
    pageFrame: prepared.pageFrame,
    retainedRuntimeFrame: prepared.retainedRuntimeFrame,
  });
  const surfaceOutcome = resolveSurfaceTransaction({
    coldPlaceholderAllowed:
      allowColdPlaceholder ||
      (previous !== null && holdCompatiblePrevious === null),
    desired: surfaceSnapshot.transaction,
    nowMs,
    previous: holdCompatiblePrevious?.surfaceTransaction ?? null,
  });
  return resolveRetainedSurfaceTransactionOutcome({
    nowMs,
    prepared,
    previous: holdCompatiblePrevious,
    proof,
    surfaceActorSnapshots: surfaceSnapshot.actorSnapshots,
    surfaceOutcome,
  });
}

function getRetainedDisplayHoldCompatiblePrevious({
  prepared,
  previous,
}: {
  readonly prepared: RetainedDisplayFrameInput;
  readonly previous: RetainedDisplayFrame | null;
}): RetainedDisplayFrame | null {
  if (!previous) {
    return null;
  }
  if (
    !retainedRuntimeFrameSourceSurfaceIdsMatch(
      previous.retainedRuntimeFrame,
      prepared.retainedRuntimeFrame,
    )
  ) {
    return null;
  }
  return previous;
}

function retainedRuntimeFrameSourceSurfaceIdsMatch(
  previous: GpuRetainedRuntimeFrame,
  next: GpuRetainedRuntimeFrame,
): boolean {
  const previousSurfaces = previous.descriptors.sourceSurfaces;
  const nextSurfaces = next.descriptors.sourceSurfaces;
  if (previousSurfaces.length !== nextSurfaces.length) {
    return false;
  }
  for (let index = 0; index < previousSurfaces.length; index += 1) {
    if (previousSurfaces[index]?.id !== nextSurfaces[index]?.id) {
      return false;
    }
  }
  return true;
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
    case "present-cold-placeholder":
      return {
        frame: createColdPlaceholderRetainedDisplayFrame({
          nowMs,
          prepared,
          proof,
        }),
        kind: "present-cold-placeholder",
        reason: "coverage-missing",
      };
    case "block-cold-first-coverage":
      return {
        kind: "block-cold-first-coverage",
        reason: "coverage-missing",
      };
    case "present-compatible":
    case "present-exact":
      return createPresentedRetainedDisplayFrameOutcome({
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

function createPresentedRetainedDisplayFrameOutcome({
  coverageReadiness = "covered",
  nowMs,
  prepared,
  previous,
  proof,
  surfaceActorSnapshots,
  surfaceTransaction,
}: {
  readonly coverageReadiness?: CoverageReadiness | undefined;
  readonly nowMs: number;
  readonly prepared: RetainedDisplayFrameInput;
  readonly previous: RetainedDisplayFrame | null | undefined;
  readonly proof: RetainedVisibleCoverageProof;
  readonly surfaceActorSnapshots: readonly SurfaceActorSnapshot[];
  readonly surfaceTransaction: SurfaceDisplayTransaction;
}): Extract<
  RetainedDisplayFrameOutcome,
  { readonly kind: "present-compatible" | "present-exact" }
> {
  const transactionOutcome = hasCompatibleRetainedDrawRegions(
    prepared.pageFrame,
  )
    ? "present-compatible"
    : "present-exact";
  const reusablePrevious = selectReusablePresentedRetainedDisplayFrame({
    coverageReadiness,
    prepared,
    previous,
    surfaceTransaction,
    transactionOutcome,
  });
  if (reusablePrevious) {
    return transactionOutcome === "present-compatible"
      ? { frame: reusablePrevious, kind: "present-compatible" }
      : { frame: reusablePrevious, kind: "present-exact" };
  }
  const frame = createComposedRetainedDisplayFrame({
    coverageReadiness,
    diagnosticsPrevious: previous ?? null,
    holdDiagnostics: null,
    nowMs,
    prepared,
    proof,
    surfaceActorSnapshots,
    surfaceTransaction,
    transactionOutcome,
  });
  return transactionOutcome === "present-compatible"
    ? { frame, kind: "present-compatible" }
    : { frame, kind: "present-exact" };
}

function selectReusablePresentedRetainedDisplayFrame({
  coverageReadiness,
  prepared,
  previous,
  surfaceTransaction,
  transactionOutcome,
}: {
  readonly coverageReadiness: CoverageReadiness;
  readonly prepared: RetainedDisplayFrameInput;
  readonly previous: RetainedDisplayFrame | null | undefined;
  readonly surfaceTransaction: SurfaceDisplayTransaction;
  readonly transactionOutcome: PresentedFrameDiagnostics["transactionOutcome"];
}): RetainedDisplayFrame | null {
  if (!previous) {
    return null;
  }
  if (!matchesPreparedRetainedDisplayFrame(previous, prepared)) {
    return null;
  }
  if (
    !matchesPresentedRetainedDisplayDiagnostics({
      coverageReadiness,
      previous,
      transactionOutcome,
    })
  ) {
    return null;
  }
  if (!matchesRetainedSurfaceTransactionIdentity(previous, surfaceTransaction)) {
    return null;
  }
  if (
    !surfaceGenerationIdsEqual(
      previous.surfaceTransaction.hitIndex.generationIds,
      surfaceTransaction.hitIndex.generationIds,
    )
  ) {
    return null;
  }
  return previous;
}

function matchesPreparedRetainedDisplayFrame(
  previous: RetainedDisplayFrame,
  prepared: RetainedDisplayFrameInput,
): boolean {
  return (
    previous.id === prepared.id &&
    previous.retainedRuntimeFrame === prepared.retainedRuntimeFrame &&
    previous.pageFrame === prepared.pageFrame
  );
}

function matchesPresentedRetainedDisplayDiagnostics({
  coverageReadiness,
  previous,
  transactionOutcome,
}: {
  readonly coverageReadiness: CoverageReadiness;
  readonly previous: RetainedDisplayFrame;
  readonly transactionOutcome: PresentedFrameDiagnostics["transactionOutcome"];
}): boolean {
  return (
    previous.diagnostics.coverageReadiness === coverageReadiness &&
    previous.diagnostics.holdDiagnostics === null &&
    previous.diagnostics.transactionOutcome === transactionOutcome
  );
}

function matchesRetainedSurfaceTransactionIdentity(
  previous: RetainedDisplayFrame,
  surfaceTransaction: SurfaceDisplayTransaction,
): boolean {
  return (
    previous.surfaceTransaction.id === surfaceTransaction.id &&
    previous.surfaceTransaction.hitIndex.id === surfaceTransaction.hitIndex.id
  );
}

function surfaceGenerationIdsEqual(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((generationId, index) => generationId === right[index])
  );
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
  readonly transactionOutcome: PresentedFrameDiagnostics["transactionOutcome"];
}): RetainedDisplayFrame {
  const compatibleDrawRegions = prepared.pageFrame.drawRegions.filter(
    (region): region is PresentedRetainedCompatibleDrawRegion =>
      region.coverageKind === "compatible",
  );
  const exactPageCount = prepared.pageFrame.drawRegions.filter(
    (region) => region.coverageKind === "exact",
  ).length;
  const desiredActiveIslandRects = createPresentedNativeIslandRects(
    prepared.retainedRuntimeFrame,
  );
  const activeIslandRects = desiredActiveIslandRects;
  const activeIslandTransaction = resolveNativeIslandPresentationTransaction({
    blockedByCoverage: false,
    desiredIslandIds: prepared.retainedRuntimeFrame.input.activeNativeIslandIds,
    previousIslandIds: getPresentedNativeIslandIds(diagnosticsPrevious),
    presentedIslandIds: activeIslandRects.map((island) => island.id),
  });
  const domControlPlaneCompleteness = createDomControlPlaneCompleteness({
    prepared,
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
      domControlPlaneCompleteness,
      exactPageCount,
      fidelityReadiness: proof.fidelityState,
      holdDiagnostics,
      lastRejectedPreparedFrameId: null,
      presentedAtMs: nowMs,
      presentedPreparedFrameId: prepared.id,
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
      domControlPlaneCompleteness: createDomControlPlaneCompleteness({
        prepared,
      }),
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
    transactionOutcome: "present-cold-placeholder",
  });
}

function getPresentedNativeIslandIds(
  frame: RetainedDisplayFrame | null,
): readonly string[] {
  return frame?.activeIslandRects.map((island) => island.id) ?? [];
}

function createDomControlPlaneCompleteness({
  prepared,
}: {
  readonly prepared: RetainedDisplayFrameInput;
}): readonly RetainedDomControlPlaneCompletenessState[] {
  return Object.freeze(
    prepared.retainedRuntimeFrame.descriptors.domControlSources.map(
      (source) => ({
        active: source.active,
        blockingReasons:
          source.value.length > 0 && source.clipRectSurfaceCssPx.width <= 0
            ? Object.freeze(["control-clipped"])
            : Object.freeze([]),
        controlId: source.controlId,
        projected: source.clipRectSurfaceCssPx.width > 0,
        rowId: source.rowId,
        sourceKey: source.sourceKey,
        visibleNonempty: source.value.length > 0,
      }),
    ),
  );
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
      (presented) =>
        presented.manifest.surfaceId === current.manifest.surfaceId &&
        presented.manifest.documentId === current.manifest.documentId &&
        presented.manifest.themeGeneration ===
          current.manifest.themeGeneration &&
        presented.manifest.contentVersion === current.manifest.contentVersion,
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

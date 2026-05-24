import { describe, expect, it } from "vitest";

import {
  createGpuFlowCommittedSurfacePresentationProof,
  type GpuFlowCommittedSurfaceFrame,
} from "../committedSurfaceFrame";
import type { GpuFrameReason } from "../gpuRenderer";
import {
  createGpuFlowVisiblePublicationScheduler,
  type GpuFlowLiveProjectionSample,
  type GpuFlowProjectionTransaction,
  type GpuFlowProjectionTransactionKind,
  type GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import type { RetainedDisplayFrame } from "../retainedDisplayFrame";
import { createGpuFlowVisiblePublicationContentDecisionKernel } from "./visibleFrameActorAdapters/contentDecisionKernel";
import { createGpuFlowRetainedProjectionBlockedPublicationCandidate } from "./visibleFrameBlockedCandidate";
import { createGpuFlowCommittedSurfacePublicationFramePlanPreparer } from "./visibleFrameContentPlan";
import {
  runGpuFlowVisibleFrameCoordinator,
  type GpuFlowVisibleFrameBlockedPublicationCandidate,
  type GpuFlowVisibleFramePublicationSample,
} from "./visibleFrameCoordinator";

const prepareCommittedSurfacePublicationFramePlanForTest =
  createGpuFlowCommittedSurfacePublicationFramePlanPreparer({
    contentDecisionKernel:
      createGpuFlowVisiblePublicationContentDecisionKernel(),
  });

describe("GPU Flow visible frame coordinator held outcomes", () => {
  it("creates first-class cold-start shell candidates for retained projection blocks", () => {
    const candidate =
      createGpuFlowRetainedProjectionBlockedPublicationCandidate({
        blockedReason: "retained-projection-coverage-missing",
        heldPreviousProjectionState: null,
      });

    expect(candidate.frozenFrameId).toBe(
      "cold-start-shell:retained-projection",
    );
    expect(candidate.blockedReasons).toEqual([
      {
        actorId: null,
        family: "retained-projection",
        reason: "retained-projection-coverage-missing",
      },
    ]);
  });

  it("turns a no-frame attempt into a tokenized hold when a previous frame exists", () => {
    const scheduler = createGpuFlowVisiblePublicationScheduler();
    const previousVisibleProjectionState = visibleProjectionState({
      kind: "content-publication",
      sample: liveProjectionSample({ id: 4, timestamp: 40 }),
    });
    const sample = liveProjectionSample({ id: 5, timestamp: 56 });
    const result = runPreparedCandidateCoordinator({
      previousVisibleProjectionState,
      rawReasons: ["retained-scroll"],
      sample,
      scheduler,
      viewportInteractionActive: true,
    });

    expect(result.outcome.kind).toBe("hold-previous");
    if (result.outcome.kind !== "hold-previous") {
      throw new Error("Expected no-frame completion to hold previous.");
    }
    expect(result.outcome.token.committedFrameId).toBe(
      previousVisibleProjectionState.committedFrame.displayFrameId,
    );
    expect(result.outcome.token.projectionSampleId).toBe(sample.id);
    const heldState = result.heldPreviousVisibleProjectionState;
    expect(heldState?.transaction.kind).toBe("held-previous");
    expect(heldState?.heldPreviousProjection?.reason).toBe("no-visible-frame");
    expect(result.completeSchedulerFrame().completion.debt.motion).toBe(true);
  });

  it("turns a no-frame cold start into a blocked shell", () => {
    const scheduler = createGpuFlowVisiblePublicationScheduler();
    const result = runPreparedCandidateCoordinator({
      hasCommittedContentFrame: false,
      rawReasons: ["manual"],
      sample: liveProjectionSample({ id: 6, timestamp: 72 }),
      scheduler,
    });

    expect(result.outcome.kind).toBe("blocked");
    if (result.outcome.kind !== "blocked") {
      throw new Error("Expected no-frame cold start to block.");
    }
    expect(result.outcome.token.frozenFrame.kind).toBe("cold-start-shell");
    expect(result.outcome.token.blockedReasons).toEqual([
      {
        actorId: null,
        family: "visible-transaction",
        reason: "no-visible-frame-before-first-commit",
      },
    ]);
    expect(result.completeSchedulerFrame().completion.debt.content).toBe(true);
  });

  it("keeps selected content debt queued for held-previous transactions", () => {
    const scheduler = createGpuFlowVisiblePublicationScheduler();
    const sample = liveProjectionSample({ id: 3, timestamp: 30 });

    const heldVisibleProjectionState = visibleProjectionState({
      kind: "held-previous",
      sample,
    });
    const result = runPreparedCandidateCoordinator({
      contentFrame: testPublicationCandidate({
        rendered: true,
        visibleProjectionState: heldVisibleProjectionState,
      }),
      previousVisibleProjectionState: visibleProjectionState({
        kind: "motion-projection",
        sample: liveProjectionSample({ id: 99, timestamp: 1 }),
      }),
      sample,
      scheduler,
    });

    expect(result.publicationDecision.lane).toBe("content");
    expect(result.outcome.kind).toBe("hold-previous");
    expect(result.previousCommittedFrameId).toBe(7);
    expect(result.completeSchedulerFrame().completion.debt.content).toBe(true);
  });

  it("blocks rendered held-previous transactions that exceed the coordinator budget", () => {
    const scheduler = createGpuFlowVisiblePublicationScheduler();
    const sample = liveProjectionSample({ id: 33, timestamp: 330 });
    const heldVisibleProjectionState = visibleProjectionState({
      kind: "held-previous",
      sample,
    });
    if (!heldVisibleProjectionState.heldPreviousProjection) {
      throw new Error("Expected held-previous projection diagnostics.");
    }

    const result = runPreparedCandidateCoordinator({
      contentFrame: testPublicationCandidate({
        rendered: true,
        visibleProjectionState: {
          ...heldVisibleProjectionState,
          heldPreviousProjection: {
            ...heldVisibleProjectionState.heldPreviousProjection,
            consecutiveFrameCount: 7,
            heldDurationMs: 121,
            maxHeldPreviousFramesExceeded: true,
            maxHeldPreviousMsExceeded: true,
          },
        },
      }),
      previousVisibleProjectionState: visibleProjectionState({
        kind: "content-publication",
        sample: liveProjectionSample({ id: 32, timestamp: 316 }),
      }),
      sample,
      scheduler,
    });

    expect(result.outcome.kind).toBe("blocked");
    if (result.outcome.kind !== "blocked") {
      throw new Error("Expected over-budget held-previous block.");
    }
    expect(result.outcome.token.frozenFrameId).toBe(
      heldVisibleProjectionState.committedFrame.displayFrameId,
    );
    expect(result.outcome.token.blockedReasons).toEqual([
      {
        actorId: null,
        family: "browser-visual",
        reason: "browser-visual-coverage-missing",
      },
    ]);
    expect(result.preparedFrame.visibleFrameStateMachineOutcome?.kind).toBe(
      "aborted",
    );
    expect(
      result.preparedFrame.visibleFrameStateMachineOutcome?.decidingProof,
    ).toEqual(
      expect.objectContaining({
        reason: "held-previous-budget-exceeded",
      }),
    );
    expect(result.completeSchedulerFrame().completion.debt.content).toBe(true);
  });

  it("turns a nonpublishable committed-surface candidate into a held outcome at completion", () => {
    const scheduler = createGpuFlowVisiblePublicationScheduler();
    const sample = liveProjectionSample({ id: 4, timestamp: 64 });
    const previousVisibleProjectionState = visibleProjectionState({
      kind: "content-publication",
      sample: liveProjectionSample({ id: 3, timestamp: 48 }),
    });

    const candidate = prepareCommittedSurfacePublicationCandidateForTest({
      heldPreviousProjectionState: previousVisibleProjectionState,
      liveSample: sample,
      publishedCommittedSurfaceFrame: blockedCommittedSurfaceFrame({
        actorFamily: "dom-control",
        projectionCoverage: "blocked-awaiting-browser-visual",
        readinessReason: "snapshot-pending",
      }),
    });

    expect(candidate.kind).toBe("nonpublishable");
    if (candidate.kind !== "nonpublishable") {
      throw new Error("Expected nonpublishable committed-surface candidate.");
    }
    expect("token" in candidate).toBe(false);

    const completion = runPreparedCandidateCoordinator({
      contentFrame: testPublicationCandidate({
        blockedPublicationCandidate: candidate.blockedPublicationCandidate,
        rendered: false,
        visibleProjectionState: null,
      }),
      previousVisibleProjectionState,
      sample,
      scheduler,
    });

    expect(completion.outcome.kind).toBe("hold-previous");
    if (completion.outcome.kind !== "hold-previous") {
      throw new Error("Expected held-previous completion outcome.");
    }
    expect(completion.outcome.token.committedFrameId).toBe(
      previousVisibleProjectionState.committedFrame.displayFrameId,
    );
    expect(completion.outcome.token.projectionSampleId).toBe(sample.id);
    expect(
      completion.heldPreviousVisibleProjectionState?.transaction.kind,
    ).toBe("held-previous");
    expect(completion.preparedFrame.visibleFrameStateMachineOutcome?.kind).toBe(
      "held",
    );
  });
});

function visibleProjectionState({
  committedFrame = committedSurfaceFrame(),
  heldPreviousProjection,
  kind,
  sample,
  transaction,
}: {
  readonly committedFrame?: GpuFlowCommittedSurfaceFrame | undefined;
  readonly heldPreviousProjection?:
    | GpuFlowVisibleProjectionState["heldPreviousProjection"]
    | undefined;
  readonly kind: GpuFlowProjectionTransactionKind;
  readonly sample: GpuFlowLiveProjectionSample;
  readonly transaction?: GpuFlowProjectionTransaction | undefined;
}): GpuFlowVisibleProjectionState {
  const selectedTransaction =
    transaction ??
    ({
      committedFrameId: committedFrame.displayFrameId,
      id: `transaction:${kind}:${sample.id}`,
      kind,
      lane: "content",
      rawReasons: ["manual"],
      sample,
      startedAtMs: sample.timestamp,
    } satisfies GpuFlowProjectionTransaction);
  return {
    committedFrame,
    debugState: {
      committedFrameId: committedFrame.displayFrameId,
      gestureOwner: "idle",
      heldPreviousDurationMs: kind === "held-previous" ? 16 : 0,
      heldPreviousFrameCount: kind === "held-previous" ? 1 : 0,
      heldPreviousOverBudget: false,
      heldPreviousReason: null,
      heldPreviousRequestedSampleId:
        kind === "held-previous" ? sample.id : null,
      lane: "content",
      projectionSampleId: sample.id,
      projectionTransactionId: `transaction:${kind}:${sample.id}`,
      transactionKind: kind,
    },
    heldPreviousProjection:
      selectedTransaction.kind === "held-previous"
        ? heldPreviousProjection ??
          ({
            committedFrameId: committedFrame.displayFrameId,
            consecutiveFrameCount: 1,
            heldDurationMs: 16,
            maxHeldPreviousFramesExceeded: false,
            maxHeldPreviousMsExceeded: false,
            reason: "browser-visual-coverage-missing",
            requestedProjectionSampleId: sample.id,
          } as GpuFlowVisibleProjectionState["heldPreviousProjection"])
        : null,
    sample,
    transaction: selectedTransaction,
  };
}

function committedSurfaceFrame(): GpuFlowCommittedSurfaceFrame {
  const displayFrameId = 7;
  const coherence = {
    canvasRetainedFrameId: displayFrameId,
    clipChainRevision: "clip",
    debugSnapshotFrameId: displayFrameId,
    domControlCommittedFrameId: displayFrameId,
    domIslandCommittedFrameId: displayFrameId,
    gpuNativeVisualCommittedFrameId: displayFrameId,
    hitGenerationId: `hit:${displayFrameId}`,
    htmlTextureOverlayCommittedFrameId: displayFrameId,
    retainedScrollRevision: 0,
  };
  return {
    actorGenerations: [],
    coherence,
    displayFrameId,
    presentationProof: createGpuFlowCommittedSurfacePresentationProof({
      coherence,
      displayFrameId,
    }),
    projectionHorizon: {
      textActorCoverage: {
        blockedAwaitingBrowserVisualActorIds: [],
        blockedAwaitingLiveHostActorIds: [],
        compatiblePreviousActorIds: [],
        exactLiveDomActorIds: [],
        exactSnapshotActorIds: [],
        trueHoleActorIds: [],
      },
    },
    publishability: {
      blockingActorIds: [],
      kind: "publishable",
    },
    surfaceTransaction: null,
  } as unknown as GpuFlowCommittedSurfaceFrame;
}

function prepareCommittedSurfacePublicationCandidateForTest({
  heldPreviousProjectionState,
  liveSample = liveProjectionSample({ id: 21, timestamp: 216 }),
  publishedCommittedSurfaceFrame,
}: {
  readonly heldPreviousProjectionState: GpuFlowVisibleProjectionState | null;
  readonly liveSample?: GpuFlowLiveProjectionSample | undefined;
  readonly publishedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame;
}) {
  return prepareCommittedSurfacePublicationFramePlanForTest({
    committedGpuNativeVisuals: undefined,
    frameReasons: ["manual"],
    heldPreviousProjectionState,
    liveProjectionSample: liveSample,
    publicationLane: "content",
    publishedCommittedSurfaceFrame,
    publishedRetainedFrame: retainedDisplayFrame(),
  }).candidate;
}

function blockedCommittedSurfaceFrame({
  actorFamily,
  projectionCoverage,
  readinessReason,
}: {
  readonly actorFamily: string;
  readonly projectionCoverage:
    | "blocked-awaiting-browser-visual"
    | "blocked-awaiting-live-host";
  readonly readinessReason: "live-dom-budget" | "snapshot-pending";
}): GpuFlowCommittedSurfaceFrame {
  return {
    actorGenerations: [
      {
        actorFamily,
        actorId: "actor-a",
        kind: "dom-control",
        textCoverageProof: {
          projectionCoverage,
          readinessReason,
        },
      },
    ],
    displayFrameId: 8,
    projectionHorizon: {
      obligations: {
        visibleActorIds: ["actor-a"],
      },
      textActorCoverage: {
        blockedAwaitingBrowserVisualActorIds:
          projectionCoverage === "blocked-awaiting-browser-visual"
            ? ["actor-a"]
            : [],
        blockedAwaitingLiveHostActorIds:
          projectionCoverage === "blocked-awaiting-live-host"
            ? ["actor-a"]
            : [],
        compatiblePreviousActorIds: [],
        exactLiveDomActorIds: [],
        exactSnapshotActorIds: [],
        trueHoleActorIds: [],
      },
    },
    publishability: {
      blockingActorIds: ["actor-a"],
      kind: "hold-previous",
      reason: "visible-dom-control-not-projected",
    },
  } as unknown as GpuFlowCommittedSurfaceFrame;
}

function retainedDisplayFrame(): RetainedDisplayFrame {
  return {
    id: 42,
    pageFrame: {
      flatSurfaces: [],
      protectedPageKeys: [],
    },
    retainedRuntimeFrame: {
      descriptors: {
        domControlSources: [],
        htmlSurfaceNativeVisuals: [],
        nativeDomIslands: [],
        sourceSurfaces: [],
      },
      frameId: 42,
      input: {
        scrollOffsets: new Map(),
      },
    },
  } as unknown as RetainedDisplayFrame;
}

type TestPublicationCandidate = {
  readonly blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate | null;
  readonly rendered: boolean;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
};

function runPreparedCandidateCoordinator({
  contentFrame = testPublicationCandidate(),
  hasCommittedContentFrame = true,
  motionFrame = testPublicationCandidate(),
  previousVisibleProjectionState = null,
  publish = () => {},
  rawReasons = ["manual"],
  sample,
  scheduler,
  viewportInteractionActive = false,
}: {
  readonly contentFrame?: TestPublicationCandidate;
  readonly hasCommittedContentFrame?: boolean;
  readonly motionFrame?: TestPublicationCandidate;
  readonly previousVisibleProjectionState?: GpuFlowVisibleProjectionState | null;
  readonly publish?: Parameters<
    typeof runGpuFlowVisibleFrameCoordinator<
      TestPublicationCandidate,
      TestPublicationCandidate
    >
  >[0]["publish"];
  readonly rawReasons?: readonly GpuFrameReason[];
  readonly sample: GpuFlowLiveProjectionSample;
  readonly scheduler: ReturnType<
    typeof createGpuFlowVisiblePublicationScheduler
  >;
  readonly viewportInteractionActive?: boolean;
}) {
  return runGpuFlowVisibleFrameCoordinator<
    TestPublicationCandidate,
    TestPublicationCandidate
  >({
    prepareContentPublicationFrame: () => contentFrame,
    prepareMotionProjectionFrame: () => ({
      frame: motionFrame,
      kind: "not-rendered",
    }),
    publish,
    sampleVisibleFramePublication: () =>
      visibleFramePublicationSample({
        hasCommittedContentFrame,
        previousVisibleProjectionState,
        rawReasons,
        sample,
        viewportInteractionActive,
      }),
    scheduler,
  });
}

function testPublicationCandidate({
  blockedPublicationCandidate = null,
  rendered = false,
  visibleProjectionState = null,
}: Partial<TestPublicationCandidate> = {}): TestPublicationCandidate {
  return {
    blockedPublicationCandidate,
    rendered,
    visibleProjectionState,
  };
}

type VisibleFramePublicationSampleInput = Partial<
  Omit<GpuFlowVisibleFramePublicationSample, "sample">
> & { readonly sample: GpuFlowLiveProjectionSample };

function visibleFramePublicationSample({
  hasCommittedContentFrame = true,
  previousVisibleProjectionState = null,
  rawReasons = ["manual"],
  runtimeViewportFrame = false,
  sample,
  timestamp = sample.timestamp,
  viewportInteractionActive = false,
}: VisibleFramePublicationSampleInput): GpuFlowVisibleFramePublicationSample {
  return {
    hasCommittedContentFrame,
    previousVisibleProjectionState,
    rawReasons,
    runtimeViewportFrame,
    sample,
    timestamp,
    viewportInteractionActive,
  };
}

function liveProjectionSample({
  id,
  timestamp,
}: {
  readonly id: number;
  readonly timestamp: number;
}): GpuFlowLiveProjectionSample {
  return {
    cssViewport: { height: 600, width: 800 },
    devicePixelRatio: 1,
    gestureOwner: "idle",
    id,
    retainedScrollDelta: new Map(),
    retainedScrollOffsets: new Map(),
    retainedScrollRevision: 0,
    retainedScrollVelocityCssPxPerMs: new Map(),
    timestamp,
    viewport: [0, 0, 1],
    viewportDelta: { x: 0, y: 0, zoom: 0 },
    viewportVelocityCssPxPerMs: { x: 0, y: 0, zoom: 0 },
  };
}

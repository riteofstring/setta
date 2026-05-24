import { describe, expect, it } from "vitest";

import type { GpuFrameReason } from "../gpuRenderer";
import {
  createGpuFlowPreparedContentPresentationProof,
  type GpuFlowPreparedContentFrame,
} from "../preparedContentFrame";
import {
  createGpuFlowVisibleFrameReducerRuntime,
  type GpuFlowLiveProjectionSample,
  type GpuFlowProjectionTransaction,
  type GpuFlowProjectionTransactionKind,
  type GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import type { RetainedDisplayFrame } from "../retainedDisplayFrame";
import { createGpuFlowVisibleFramePresentationContentDecisionKernel } from "./visibleFrameActorAdapters/contentDecisionKernel";
import { createGpuFlowRetainedProjectionBlockedPresentationCandidate } from "./visibleFrameBlockedCandidate";
import { createGpuFlowPreparedContentFramePublicationFramePlanPreparer } from "./visibleFrameContentPlan";
import {
  runGpuFlowVisibleFrameCoordinator,
  type GpuFlowVisibleFrameBlockedPresentationCandidate,
  type GpuFlowVisibleFramePublicationSample,
} from "./visibleFrameCoordinator";

const preparePreparedContentFramePublicationFramePlanForTest =
  createGpuFlowPreparedContentFramePublicationFramePlanPreparer({
    contentDecisionKernel:
      createGpuFlowVisibleFramePresentationContentDecisionKernel(),
  });

describe("GPU Flow visible frame coordinator held outcomes", () => {
  it("creates first-class cold-start shell candidates for retained projection blocks", () => {
    const candidate =
      createGpuFlowRetainedProjectionBlockedPresentationCandidate({
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
    const scheduler = createGpuFlowVisibleFrameReducerRuntime();
    const previousVisibleProjectionState = visibleProjectionState({
      kind: "prepared-content",
      sample: liveProjectionSample({ id: 4, timestamp: 40 }),
    });
    const sample = liveProjectionSample({ id: 5, timestamp: 56 });
    const result = runPreparedCandidateCoordinator({
      previousVisibleProjectionState,
      rawReasons: ["retained-scroll"],
      sample,
      reducerRuntime: scheduler,
      viewportInteractionActive: true,
    });

    expect(result.outcome.kind).toBe("hold-previous");
    if (result.outcome.kind !== "hold-previous") {
      throw new Error("Expected no-frame completion to hold previous.");
    }
    expect(result.outcome.token.preparedContentFrameId).toBe(
      previousVisibleProjectionState.preparedContentFrame.displayFrameId,
    );
    expect(result.outcome.token.projectionSampleId).toBe(sample.id);
    const heldState = result.heldPreviousVisibleProjectionState;
    expect(heldState?.transaction.kind).toBe("held-previous");
    expect(heldState?.heldPreviousProjection?.reason).toBe("no-visible-frame");
    expect(result.completeReducerFrame().completion.debt.motion).toBe(true);
  });

  it("turns a no-frame cold start into a blocked shell", () => {
    const scheduler = createGpuFlowVisibleFrameReducerRuntime();
    const result = runPreparedCandidateCoordinator({
      hasPresentedContentFrame: false,
      rawReasons: ["manual"],
      sample: liveProjectionSample({ id: 6, timestamp: 72 }),
      reducerRuntime: scheduler,
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
    expect(result.completeReducerFrame().completion.debt.content).toBe(true);
  });

  it("keeps selected content debt queued for held-previous transactions", () => {
    const scheduler = createGpuFlowVisibleFrameReducerRuntime();
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
      reducerRuntime: scheduler,
    });

    expect(result.reducerDecision.lane).toBe("content");
    expect(result.outcome.kind).toBe("hold-previous");
    expect(result.previousContentFrameId).toBe(7);
    expect(result.completeReducerFrame().completion.debt.content).toBe(true);
  });

  it("blocks rendered held-previous transactions that exceed the coordinator budget", () => {
    const scheduler = createGpuFlowVisibleFrameReducerRuntime();
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
        kind: "prepared-content",
        sample: liveProjectionSample({ id: 32, timestamp: 316 }),
      }),
      sample,
      reducerRuntime: scheduler,
    });

    expect(result.outcome.kind).toBe("blocked");
    if (result.outcome.kind !== "blocked") {
      throw new Error("Expected over-budget held-previous block.");
    }
    expect(result.outcome.token.frozenFrameId).toBe(
      heldVisibleProjectionState.preparedContentFrame.displayFrameId,
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
    expect(result.completeReducerFrame().completion.debt.content).toBe(true);
  });

  it("turns a nonpublishable prepared-content-frame candidate into a held outcome at completion", () => {
    const scheduler = createGpuFlowVisibleFrameReducerRuntime();
    const sample = liveProjectionSample({ id: 4, timestamp: 64 });
    const previousVisibleProjectionState = visibleProjectionState({
      kind: "prepared-content",
      sample: liveProjectionSample({ id: 3, timestamp: 48 }),
    });

    const candidate = preparePreparedContentFramePublicationCandidateForTest({
      heldPreviousProjectionState: previousVisibleProjectionState,
      liveSample: sample,
      preparedContentFrame: blockedPreparedContentFrame({
        actorFamily: "dom-control",
        projectionCoverage: "blocked-awaiting-browser-visual",
        readinessReason: "snapshot-pending",
      }),
    });

    expect(candidate.kind).toBe("nonpublishable");
    if (candidate.kind !== "nonpublishable") {
      throw new Error(
        "Expected nonpublishable prepared-content-frame candidate.",
      );
    }
    expect("token" in candidate).toBe(false);

    const completion = runPreparedCandidateCoordinator({
      contentFrame: testPublicationCandidate({
        blockedPresentationCandidate: candidate.blockedPresentationCandidate,
        rendered: false,
        visibleProjectionState: null,
      }),
      previousVisibleProjectionState,
      sample,
      reducerRuntime: scheduler,
    });

    expect(completion.outcome.kind).toBe("hold-previous");
    if (completion.outcome.kind !== "hold-previous") {
      throw new Error("Expected held-previous completion outcome.");
    }
    expect(completion.outcome.token.preparedContentFrameId).toBe(
      previousVisibleProjectionState.preparedContentFrame.displayFrameId,
    );
    expect(completion.outcome.token.projectionSampleId).toBe(sample.id);
    expect(
      completion.heldPreviousVisibleProjectionState?.transaction.kind,
    ).toBe("held-previous");
    expect(completion.preparedFrame.visibleFrameStateMachineOutcome?.kind).toBe(
      "held",
    );
  });

  it("does not surface retained true-hole candidates as page errors", () => {
    const previousVisibleProjectionState = visibleProjectionState({
      kind: "prepared-content",
      sample: liveProjectionSample({ id: 13, timestamp: 208 }),
    });
    const candidate = preparePreparedContentFramePublicationCandidateForTest({
      heldPreviousProjectionState: previousVisibleProjectionState,
      preparedContentFrame: trueHolePreparedContentFrame(),
    });
    const coldCandidate =
      preparePreparedContentFramePublicationCandidateForTest({
        heldPreviousProjectionState: null,
        preparedContentFrame: trueHolePreparedContentFrame(),
      });

    expect(candidate.kind).toBe("nonpublishable");
    if (candidate.kind !== "nonpublishable") {
      throw new Error(
        "Expected nonpublishable prepared-content-frame candidate.",
      );
    }
    expect(candidate.errorMessage).toBeNull();
    expect(candidate.blockedPresentationCandidate.frozenFrameId).toBe(
      previousVisibleProjectionState.preparedContentFrame.displayFrameId,
    );

    expect(coldCandidate.kind).toBe("nonpublishable");
    if (coldCandidate.kind !== "nonpublishable") {
      throw new Error(
        "Expected cold nonpublishable prepared-content-frame candidate.",
      );
    }
    expect(coldCandidate.errorMessage).toBeNull();
  });
});

function visibleProjectionState({
  preparedContentFrame = createPreparedContentFrame(),
  heldPreviousProjection,
  kind,
  sample,
  transaction,
}: {
  readonly preparedContentFrame?: GpuFlowPreparedContentFrame | undefined;
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
      preparedContentFrameId: preparedContentFrame.displayFrameId,
      id: `transaction:${kind}:${sample.id}`,
      kind,
      lane: "content",
      rawReasons: ["manual"],
      sample,
      startedAtMs: sample.timestamp,
    } satisfies GpuFlowProjectionTransaction);
  return {
    preparedContentFrame,
    debugState: {
      preparedContentFrameId: preparedContentFrame.displayFrameId,
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
            preparedContentFrameId: preparedContentFrame.displayFrameId,
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

function createPreparedContentFrame(): GpuFlowPreparedContentFrame {
  const displayFrameId = 7;
  const coherence = {
    canvasRetainedFrameId: displayFrameId,
    clipChainRevision: "clip",
    debugSnapshotFrameId: displayFrameId,
    domControlPreparedFrameId: displayFrameId,
    domIslandPreparedFrameId: displayFrameId,
    gpuNativeVisualPreparedFrameId: displayFrameId,
    hitGenerationId: `hit:${displayFrameId}`,
    htmlTextureOverlayPreparedFrameId: displayFrameId,
    retainedScrollRevision: 0,
  };
  return {
    actorGenerations: [],
    coherence,
    displayFrameId,
    presentationProof: createGpuFlowPreparedContentPresentationProof({
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
  } as unknown as GpuFlowPreparedContentFrame;
}

function preparePreparedContentFramePublicationCandidateForTest({
  heldPreviousProjectionState,
  liveSample = liveProjectionSample({ id: 21, timestamp: 216 }),
  preparedContentFrame,
}: {
  readonly heldPreviousProjectionState: GpuFlowVisibleProjectionState | null;
  readonly liveSample?: GpuFlowLiveProjectionSample | undefined;
  readonly preparedContentFrame: GpuFlowPreparedContentFrame;
}) {
  return preparePreparedContentFramePublicationFramePlanForTest({
    committedGpuNativeVisuals: undefined,
    frameReasons: ["manual"],
    heldPreviousProjectionState,
    liveProjectionSample: liveSample,
    contentWorkLane: "content",
    preparedContentFrame,
    publishedRetainedFrame: retainedDisplayFrame(),
  }).candidate;
}

function blockedPreparedContentFrame({
  actorFamily,
  projectionCoverage,
  readinessReason,
}: {
  readonly actorFamily: string;
  readonly projectionCoverage:
    | "blocked-awaiting-browser-visual"
    | "blocked-awaiting-live-host";
  readonly readinessReason: "live-dom-budget" | "snapshot-pending";
}): GpuFlowPreparedContentFrame {
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
  } as unknown as GpuFlowPreparedContentFrame;
}

function trueHolePreparedContentFrame(): GpuFlowPreparedContentFrame {
  const actorId =
    "settings-section__sectionSizingPolicy:param-content:unpinned";
  return {
    actorGenerations: [],
    displayFrameId: 9,
    projectionHorizon: {
      obligations: {
        visibleActorIds: [actorId],
      },
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
      actorFamily: "retained-page",
      actorIds: [actorId],
      blockingActorIds: [],
      kind: "true-hole",
      reason: "retained-surface-true-hole",
    },
  } as unknown as GpuFlowPreparedContentFrame;
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
  readonly blockedPresentationCandidate: GpuFlowVisibleFrameBlockedPresentationCandidate | null;
  readonly rendered: boolean;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
};

function runPreparedCandidateCoordinator({
  contentFrame = testPublicationCandidate(),
  hasPresentedContentFrame = true,
  motionFrame = testPublicationCandidate(),
  previousVisibleProjectionState = null,
  publish = () => {},
  rawReasons = ["manual"],
  sample,
  reducerRuntime: scheduler,
  viewportInteractionActive = false,
}: {
  readonly contentFrame?: TestPublicationCandidate;
  readonly hasPresentedContentFrame?: boolean;
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
  readonly reducerRuntime: ReturnType<
    typeof createGpuFlowVisibleFrameReducerRuntime
  >;
  readonly viewportInteractionActive?: boolean;
}) {
  return runGpuFlowVisibleFrameCoordinator<
    TestPublicationCandidate,
    TestPublicationCandidate
  >({
    prepareContentPreparationFrame: () => contentFrame,
    prepareMotionProjectionFrame: () => ({
      frame: motionFrame,
      kind: "not-rendered",
    }),
    publish,
    sampleVisibleFramePublication: () =>
      visibleFramePublicationSample({
        hasPresentedContentFrame,
        previousVisibleProjectionState,
        rawReasons,
        sample,
        viewportInteractionActive,
      }),
    reducerRuntime: scheduler,
  });
}

function testPublicationCandidate({
  blockedPresentationCandidate = null,
  rendered = false,
  visibleProjectionState = null,
}: Partial<TestPublicationCandidate> = {}): TestPublicationCandidate {
  return {
    blockedPresentationCandidate,
    rendered,
    visibleProjectionState,
  };
}

type VisibleFramePublicationSampleInput = Partial<
  Omit<GpuFlowVisibleFramePublicationSample, "sample">
> & { readonly sample: GpuFlowLiveProjectionSample };

function visibleFramePublicationSample({
  hasPresentedContentFrame = true,
  previousVisibleProjectionState = null,
  rawReasons = ["manual"],
  runtimeViewportFrame = false,
  sample,
  timestamp = sample.timestamp,
  viewportInteractionActive = false,
}: VisibleFramePublicationSampleInput): GpuFlowVisibleFramePublicationSample {
  return {
    hasPresentedContentFrame,
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

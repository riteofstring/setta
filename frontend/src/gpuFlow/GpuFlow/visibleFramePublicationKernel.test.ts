import { describe, expect, it } from "vitest";

import {
  createGpuFlowCommittedSurfacePresentationProof,
  type GpuFlowCommittedSurfaceFrame,
} from "../committedSurfaceFrame";
import {
  createGpuFlowVisiblePublicationScheduler,
  type GpuFlowLiveProjectionSample,
  type GpuFlowProjectionTransactionKind,
  type GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import type { RetainedDisplayFrame } from "../retainedDisplayFrame";
import { GPU_FLOW_BROWSER_VISUAL_COLD_START_SHELL_FRAME_ID } from "./visibleFramePublicationAuthority";
import {
  completeGpuFlowVisibleFramePublicationTransaction,
  createGpuFlowCommittedSurfaceHeldPreviousPublicationTransaction,
  createGpuFlowRetainedProjectionBlockedPublicationCandidate,
  createGpuFlowVisibleFrameBlockedPublicationToken,
  decideGpuFlowCommittedSurfacePublicationTransaction,
  runGpuFlowVisibleFramePublicationKernel,
  selectGpuFlowVisibleFramePublicationTransaction,
} from "./visibleFramePublicationKernel";

describe("GPU Flow visible publication transaction kernel", () => {
  it("runs select, prepare, complete, and publish as one transaction authority", () => {
    const scheduler = createGpuFlowVisiblePublicationScheduler();
    const sample = liveProjectionSample({ id: 12, timestamp: 120 });
    const phases: string[] = [];
    const result = runGpuFlowVisibleFramePublicationKernel({
      hasCommittedContentFrame: true,
      prepare: (publicationDecision) => {
        phases.push(`prepare:${publicationDecision.lane}`);
        return {
          blockedPublicationToken: null,
          renderedVisibleFrame: true,
          visibleProjectionState: visibleProjectionState({
            kind: "motion-projection",
            sample: publicationDecision.sample,
          }),
        };
      },
      previousVisibleProjectionState: null,
      publish: (transaction) => {
        phases.push(`publish:${transaction.outcome.kind}`);
      },
      rawReasons: ["viewport"],
      sample,
      scheduler,
      timestamp: sample.timestamp,
      viewportInteractionActive: true,
    });

    expect(phases).toEqual(["prepare:motion", "publish:commit"]);
    expect(result.publicationDecision.lane).toBe("motion");
    expect(result.outcome.kind).toBe("commit");
    expect(result.preparedFrame.visibleProjectionState?.sample.id).toBe(
      sample.id,
    );
  });

  it("selects and completes motion commits through the kernel", () => {
    const scheduler = createGpuFlowVisiblePublicationScheduler();
    const publicationDecision = selectGpuFlowVisibleFramePublicationTransaction(
      {
        hasCommittedContentFrame: true,
        rawReasons: ["viewport"],
        sample: liveProjectionSample({ id: 1, timestamp: 10 }),
        scheduler,
        timestamp: 10,
        viewportInteractionActive: true,
      },
    );

    const result = completeGpuFlowVisibleFramePublicationTransaction({
      blockedPublicationToken: null,
      publicationDecision,
      previousVisibleProjectionState: null,
      renderedVisibleFrame: true,
      scheduler,
      visibleProjectionState: visibleProjectionState({
        kind: "motion-projection",
        sample: publicationDecision.sample,
      }),
    });

    expect(publicationDecision.lane).toBe("motion");
    expect(result.outcome.kind).toBe("commit");
    expect(result.completion).toEqual({
      debt: {
        content: false,
        maintenance: false,
        motion: false,
      },
      outcome: "commit",
    });
  });

  it("keeps selected content debt queued for blocked transactions", () => {
    const scheduler = createGpuFlowVisiblePublicationScheduler();
    const publicationDecision = selectGpuFlowVisibleFramePublicationTransaction(
      {
        hasCommittedContentFrame: true,
        rawReasons: ["manual"],
        sample: liveProjectionSample({ id: 2, timestamp: 20 }),
        scheduler,
        timestamp: 20,
        viewportInteractionActive: false,
      },
    );
    const blockedToken = createGpuFlowVisibleFrameBlockedPublicationToken({
      blockedReasons: [
        {
          actorId: "actor-a",
          family: "dom-control",
          reason: "snapshot-pending",
        },
      ],
      frozenFrameId: GPU_FLOW_BROWSER_VISUAL_COLD_START_SHELL_FRAME_ID,
      projectionSample: publicationDecision.sample,
    });

    const result = completeGpuFlowVisibleFramePublicationTransaction({
      blockedPublicationToken: blockedToken,
      publicationDecision,
      previousVisibleProjectionState: null,
      renderedVisibleFrame: false,
      scheduler,
      visibleProjectionState: null,
    });

    expect(publicationDecision.lane).toBe("content");
    expect(result.outcome.kind).toBe("blocked");
    expect(result.completion.debt.content).toBe(true);
  });

  it.each([
    {
      actorFamily: "dom-control",
      projectionCoverage: "blocked-awaiting-live-host",
      readinessReason: "live-dom-budget",
    },
    {
      actorFamily: "dom-control",
      projectionCoverage: "blocked-awaiting-browser-visual",
      readinessReason: "snapshot-pending",
    },
  ] as const)(
    "holds previous frame for within-budget withheld browser visual proof $projectionCoverage",
    ({ actorFamily, projectionCoverage, readinessReason }) => {
      const previousVisibleProjectionState = visibleProjectionState({
        kind: "content-publication",
        sample: liveProjectionSample({ id: 20, timestamp: 200 }),
      });
      const decision = decideGpuFlowCommittedSurfacePublicationTransaction({
        heldPreviousProjectionState: previousVisibleProjectionState,
        publishedCommittedSurfaceFrame: blockedCommittedSurfaceFrame({
          actorFamily,
          projectionCoverage,
          readinessReason,
        }),
      });

      expect(decision.kind).toBe("held-previous");
      expect(readinessReason).toMatch(/live-dom-budget|snapshot-pending/);
    },
  );

  it("blocks withheld browser visual proof after the held-previous budget is exceeded", () => {
    const previousVisibleProjectionState = visibleProjectionState({
      kind: "held-previous",
      sample: liveProjectionSample({ id: 22, timestamp: 220 }),
    });
    const decision = decideGpuFlowCommittedSurfacePublicationTransaction({
      heldPreviousProjectionState: {
        ...previousVisibleProjectionState,
        heldPreviousProjection: {
          ...previousVisibleProjectionState.heldPreviousProjection,
          maxHeldPreviousFramesExceeded: true,
          maxHeldPreviousMsExceeded: true,
        } as GpuFlowVisibleProjectionState["heldPreviousProjection"],
      },
      publishedCommittedSurfaceFrame: blockedCommittedSurfaceFrame({
        actorFamily: "dom-control",
        projectionCoverage: "blocked-awaiting-browser-visual",
        readinessReason: "snapshot-pending",
      }),
    });

    expect(decision.kind).toBe("blocked");
    if (decision.kind !== "blocked") {
      throw new Error("Expected blocked committed-surface decision.");
    }
    expect(decision.blockedPublicationCandidate.frozenFrameId).toBe(
      previousVisibleProjectionState.committedFrame.displayFrameId,
    );
    expect(decision.blockedPublicationCandidate.blockedReasons).toEqual([
      {
        actorId: "actor-a",
        family: "dom-control",
        reason: "snapshot-pending",
      },
    ]);
  });

  it("creates first-class cold-start shell candidates for retained projection blocks", () => {
    const candidate =
      createGpuFlowRetainedProjectionBlockedPublicationCandidate({
        blockedReason: "held-previous-budget-exceeded",
        heldPreviousProjectionState: null,
      });

    expect(candidate.frozenFrameId).toBe(
      "cold-start-shell:retained-projection",
    );
    expect(candidate.blockedReasons).toEqual([
      {
        actorId: null,
        family: "retained-projection",
        reason: "held-previous-budget-exceeded",
      },
    ]);
  });

  it("mints retained projection blocked tokens from prepared blocked candidates inside the kernel", () => {
    const scheduler = createGpuFlowVisiblePublicationScheduler();
    const sample = liveProjectionSample({ id: 31, timestamp: 316 });
    let publishedOutcomeKind: string | null = null;

    const result = runGpuFlowVisibleFramePublicationKernel({
      hasCommittedContentFrame: true,
      prepare: () => ({
        blockedPublicationCandidate:
          createGpuFlowRetainedProjectionBlockedPublicationCandidate({
            blockedReason: "held-previous-budget-exceeded",
            heldPreviousProjectionState: null,
          }),
        blockedPublicationToken: null,
        renderedVisibleFrame: false,
        visibleProjectionState: null,
      }),
      previousVisibleProjectionState: null,
      publish: (transaction) => {
        publishedOutcomeKind = transaction.outcome.kind;
      },
      rawReasons: ["retained-scroll"],
      sample,
      scheduler,
      timestamp: sample.timestamp,
      viewportInteractionActive: true,
    });

    expect(result.outcome.kind).toBe("blocked");
    expect(publishedOutcomeKind).toBe("blocked");
    if (result.outcome.kind !== "blocked") {
      throw new Error("Expected kernel blocked outcome.");
    }
    expect(result.outcome.token.frozenFrame.kind).toBe("cold-start-shell");
    expect(result.outcome.token.frozenFrame).toEqual({
      frame: {
        id: "cold-start-shell:retained-projection",
        input: "disabled",
        kind: "cold-start-shell",
        reason: "retained-projection-blocked-before-first-commit",
      },
      frameId: "cold-start-shell:retained-projection",
      kind: "cold-start-shell",
    });
    expect(result.outcome.token.projectionSampleId).toBe(sample.id);
    expect(result.completion.debt.motion).toBe(true);
  });

  it("turns a no-frame attempt into a tokenized hold when a previous frame exists", () => {
    const scheduler = createGpuFlowVisiblePublicationScheduler();
    const previousVisibleProjectionState = visibleProjectionState({
      kind: "content-publication",
      sample: liveProjectionSample({ id: 4, timestamp: 40 }),
    });
    const publicationDecision = selectGpuFlowVisibleFramePublicationTransaction(
      {
        hasCommittedContentFrame: true,
        rawReasons: ["retained-scroll"],
        sample: liveProjectionSample({ id: 5, timestamp: 56 }),
        scheduler,
        timestamp: 56,
        viewportInteractionActive: true,
      },
    );

    const result = completeGpuFlowVisibleFramePublicationTransaction({
      blockedPublicationToken: null,
      publicationDecision,
      previousVisibleProjectionState,
      renderedVisibleFrame: false,
      scheduler,
      visibleProjectionState: null,
    });

    expect(result.outcome.kind).toBe("hold-previous");
    if (result.outcome.kind !== "hold-previous") {
      throw new Error("Expected no-frame completion to hold previous.");
    }
    expect(result.outcome.token.committedFrameId).toBe(
      previousVisibleProjectionState.committedFrame.displayFrameId,
    );
    expect(result.outcome.token.projectionSampleId).toBe(
      publicationDecision.sample.id,
    );
    expect(result.completion.debt.motion).toBe(true);
  });

  it("turns a no-frame cold start into a blocked shell", () => {
    const scheduler = createGpuFlowVisiblePublicationScheduler();
    const publicationDecision = selectGpuFlowVisibleFramePublicationTransaction(
      {
        hasCommittedContentFrame: false,
        rawReasons: ["manual"],
        sample: liveProjectionSample({ id: 6, timestamp: 72 }),
        scheduler,
        timestamp: 72,
        viewportInteractionActive: false,
      },
    );

    const result = completeGpuFlowVisibleFramePublicationTransaction({
      blockedPublicationToken: null,
      publicationDecision,
      previousVisibleProjectionState: null,
      renderedVisibleFrame: false,
      scheduler,
      visibleProjectionState: null,
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
    expect(result.completion.debt.content).toBe(true);
  });

  it("keeps selected content debt queued for held-previous transactions", () => {
    const scheduler = createGpuFlowVisiblePublicationScheduler();
    const publicationDecision = selectGpuFlowVisibleFramePublicationTransaction(
      {
        hasCommittedContentFrame: true,
        rawReasons: ["manual"],
        sample: liveProjectionSample({ id: 3, timestamp: 30 }),
        scheduler,
        timestamp: 30,
        viewportInteractionActive: false,
      },
    );

    const result = completeGpuFlowVisibleFramePublicationTransaction({
      blockedPublicationToken: null,
      publicationDecision,
      previousVisibleProjectionState: visibleProjectionState({
        kind: "motion-projection",
        sample: liveProjectionSample({ id: 99, timestamp: 1 }),
      }),
      renderedVisibleFrame: true,
      scheduler,
      visibleProjectionState: visibleProjectionState({
        kind: "held-previous",
        sample: publicationDecision.sample,
      }),
    });

    expect(publicationDecision.lane).toBe("content");
    expect(result.outcome.kind).toBe("hold-previous");
    expect(result.previousCommittedFrameId).toBe(7);
    expect(result.completion.debt.content).toBe(true);
  });

  it("blocks rendered held-previous transactions that exceed the kernel budget", () => {
    const scheduler = createGpuFlowVisiblePublicationScheduler();
    const publicationDecision = selectGpuFlowVisibleFramePublicationTransaction(
      {
        hasCommittedContentFrame: true,
        rawReasons: ["manual"],
        sample: liveProjectionSample({ id: 33, timestamp: 330 }),
        scheduler,
        timestamp: 330,
        viewportInteractionActive: false,
      },
    );
    const heldVisibleProjectionState = visibleProjectionState({
      kind: "held-previous",
      sample: publicationDecision.sample,
    });
    if (!heldVisibleProjectionState.heldPreviousProjection) {
      throw new Error("Expected held-previous projection diagnostics.");
    }

    const result = completeGpuFlowVisibleFramePublicationTransaction({
      blockedPublicationToken: null,
      publicationDecision,
      previousVisibleProjectionState: visibleProjectionState({
        kind: "content-publication",
        sample: liveProjectionSample({ id: 32, timestamp: 316 }),
      }),
      renderedVisibleFrame: true,
      scheduler,
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
        family: "visible-transaction",
        reason: "held-previous-budget-exceeded",
      },
    ]);
    expect(result.completion.debt.content).toBe(true);
  });

  it("preserves prepared blocked reasons when held-previous completion exceeds budget", () => {
    const scheduler = createGpuFlowVisiblePublicationScheduler();
    const publicationDecision = selectGpuFlowVisibleFramePublicationTransaction(
      {
        hasCommittedContentFrame: true,
        rawReasons: ["manual"],
        sample: liveProjectionSample({ id: 34, timestamp: 340 }),
        scheduler,
        timestamp: 340,
        viewportInteractionActive: false,
      },
    );
    const heldVisibleProjectionState = visibleProjectionState({
      kind: "held-previous",
      sample: publicationDecision.sample,
    });
    if (!heldVisibleProjectionState.heldPreviousProjection) {
      throw new Error("Expected held-previous projection diagnostics.");
    }
    const blockedToken = createGpuFlowVisibleFrameBlockedPublicationToken({
      blockedReasons: [
        {
          actorId: "actor-a",
          family: "dom-control",
          reason: "snapshot-pending",
        },
      ],
      frozenFrameId: heldVisibleProjectionState.committedFrame.displayFrameId,
      projectionSample: publicationDecision.sample,
    });

    const result = completeGpuFlowVisibleFramePublicationTransaction({
      blockedPublicationToken: blockedToken,
      publicationDecision,
      previousVisibleProjectionState: visibleProjectionState({
        kind: "content-publication",
        sample: liveProjectionSample({ id: 33, timestamp: 330 }),
      }),
      renderedVisibleFrame: true,
      scheduler,
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
    });

    expect(result.outcome.kind).toBe("blocked");
    if (result.outcome.kind !== "blocked") {
      throw new Error("Expected over-budget held-previous block.");
    }
    expect(result.outcome.token).toBe(blockedToken);
    expect(result.outcome.token.blockedReasons).toEqual([
      {
        actorId: "actor-a",
        family: "dom-control",
        reason: "snapshot-pending",
      },
    ]);
  });

  it("creates committed-surface held-previous transaction state and mints its token at completion", () => {
    const scheduler = createGpuFlowVisiblePublicationScheduler();
    const publicationDecision = selectGpuFlowVisibleFramePublicationTransaction(
      {
        hasCommittedContentFrame: true,
        rawReasons: ["manual"],
        sample: liveProjectionSample({ id: 4, timestamp: 64 }),
        scheduler,
        timestamp: 64,
        viewportInteractionActive: false,
      },
    );
    const sample = publicationDecision.sample;
    const previousVisibleProjectionState = visibleProjectionState({
      kind: "content-publication",
      sample: liveProjectionSample({ id: 3, timestamp: 48 }),
    });

    const transaction =
      createGpuFlowCommittedSurfaceHeldPreviousPublicationTransaction({
        committedGpuNativeVisuals: undefined,
        frameReasons: ["manual"],
        heldPreviousProjectionState: previousVisibleProjectionState,
        liveProjectionSample: sample,
        publicationLane: "content",
        publishedRetainedFrame: retainedDisplayFrame(),
      });

    expect(transaction.kind).toBe("held-previous");
    expect("token" in transaction).toBe(false);
    expect(transaction.visibleProjectionState.transaction.kind).toBe(
      "held-previous",
    );
    expect(transaction.visibleProjectionState.sample.id).toBe(sample.id);
    expect(
      transaction.visibleProjectionState.committedFrame.displayFrameId,
    ).toBe(previousVisibleProjectionState.committedFrame.displayFrameId);
    const completion = completeGpuFlowVisibleFramePublicationTransaction({
      blockedPublicationToken: null,
      publicationDecision,
      previousVisibleProjectionState,
      renderedVisibleFrame: true,
      scheduler,
      visibleProjectionState: transaction.visibleProjectionState,
    });

    expect(completion.outcome.kind).toBe("hold-previous");
    if (completion.outcome.kind !== "hold-previous") {
      throw new Error("Expected held-previous completion outcome.");
    }
    expect(completion.outcome.token.committedFrameId).toBe(
      previousVisibleProjectionState.committedFrame.displayFrameId,
    );
    expect(completion.outcome.token.projectionSampleId).toBe(sample.id);
  });
});

function visibleProjectionState({
  kind,
  sample,
}: {
  readonly kind: GpuFlowProjectionTransactionKind;
  readonly sample: GpuFlowLiveProjectionSample;
}): GpuFlowVisibleProjectionState {
  const committedFrame = committedSurfaceFrame();
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
      kind === "held-previous"
        ? ({
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
    transaction: {
      committedFrameId: committedFrame.displayFrameId,
      id: `transaction:${kind}:${sample.id}`,
      kind,
      lane: "content",
      rawReasons: ["manual"],
      sample,
      startedAtMs: sample.timestamp,
    },
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

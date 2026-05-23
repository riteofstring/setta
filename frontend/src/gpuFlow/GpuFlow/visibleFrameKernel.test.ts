import { describe, expect, it } from "vitest";

import {
  createGpuFlowCommittedSurfacePresentationProof,
  type GpuFlowCommittedSurfaceFrame,
} from "../committedSurfaceFrame";
import type { GpuFrameReason } from "../gpuRenderer";
import {
  createGpuFlowProjectionTransactionForCommittedFrameId,
  createGpuFlowVisiblePublicationScheduler,
  type GpuFlowLiveProjectionSample,
  type GpuFlowProjectionTransaction,
  type GpuFlowProjectionTransactionKind,
  type GpuFlowVisibleProjectionState,
  type GpuFlowVisiblePublicationDecision,
} from "../projectionRuntime";
import type { RetainedDisplayFrame } from "../retainedDisplayFrame";
import { createGpuFlowVisiblePublicationContentDecisionKernel } from "./visibleFrameActorAdapters/contentDecisionKernel";
import { createGpuFlowRetainedProjectionBlockedPublicationCandidate } from "./visibleFrameBlockedCandidate";
import { createGpuFlowCommittedSurfacePublicationFramePlanPreparer } from "./visibleFrameContentPlan";
import {
  runGpuFlowVisibleFramePublicationCandidateSetKernel,
  type GpuFlowVisibleFrameBlockedPublicationCandidate,
  type GpuFlowVisibleFramePublicationSample,
} from "./visibleFrameKernel";
import { createGpuFlowVisiblePublicationCanvasPresentationEvidence } from "./visibleFramePresentationEvidence";
import { createGpuFlowVisiblePublicationCommitOracleFactory } from "./visibleFrameTransactionProofs";
import { GPU_FLOW_BROWSER_VISUAL_COLD_START_SHELL_FRAME_ID } from "./visibleFrameTypes";

const createGpuFlowVisiblePublicationCommitOracleFromFactory =
  createGpuFlowVisiblePublicationCommitOracleFactory();
const createGpuFlowVisiblePublicationCommitOracle = ({
  committedFrame,
  publicationDecision,
}: {
  readonly committedFrame: GpuFlowCommittedSurfaceFrame;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
}) => {
  const projectionTransactionId = `transaction:content-publication:${publicationDecision.sample.id}`;
  return createGpuFlowVisiblePublicationCommitOracleFromFactory({
    committedFrame,
    presentationEvidence: {
      canvasGenerationEvidence:
        createGpuFlowVisiblePublicationCanvasPresentationEvidence({
          committedFrame,
          projectionSampleId: publicationDecision.sample.id,
          projectionTransactionId,
        }),
    },
    publicationDecision,
    projectionTransactionId,
  });
};
const prepareCommittedSurfacePublicationFramePlanForTest =
  createGpuFlowCommittedSurfacePublicationFramePlanPreparer({
    contentDecisionKernel:
      createGpuFlowVisiblePublicationContentDecisionKernel(),
  });

describe("GPU Flow visible publication transaction kernel", () => {
  it("prepares motion and content candidate sets inside the kernel before completion", () => {
    const scheduler = createGpuFlowVisiblePublicationScheduler();
    const sample = liveProjectionSample({ id: 50, timestamp: 500 });
    const contentVisibleState = visibleProjectionState({
      kind: "content-publication",
      sample,
    });
    const phases: string[] = [];
    type TestContentPublicationFrame = {
      readonly blockedPublicationCandidate: null;
      readonly presentationEvidence: {
        readonly canvasGenerationEvidence: ReturnType<
          typeof createGpuFlowVisiblePublicationCanvasPresentationEvidence
        >;
      };
      readonly rendered: boolean;
      readonly visibleProjectionState: GpuFlowVisibleProjectionState;
    };
    type TestMotionProjectionFrame = {
      readonly blockedPublicationCandidate: null;
      readonly rendered: boolean;
      readonly visibleProjectionState: null;
    };
    const result = runGpuFlowVisibleFramePublicationCandidateSetKernel<
      TestContentPublicationFrame,
      TestMotionProjectionFrame
    >({
      prepareContentPublicationFrame: ({
        motionProjectionFrame,
        publicationFrameContext,
      }) => {
        phases.push(
          `content:${motionProjectionFrame.visibleProjectionState === null ? "no-motion" : "motion"}:viewport=${publicationFrameContext.viewportFrame}:defer=${publicationFrameContext.deferResolutionUpdates}`,
        );
        return {
          blockedPublicationCandidate: null,
          presentationEvidence: {
            canvasGenerationEvidence:
              createGpuFlowVisiblePublicationCanvasPresentationEvidence({
                committedFrame: contentVisibleState.committedFrame,
                projectionSampleId: contentVisibleState.sample.id,
                projectionTransactionId: contentVisibleState.transaction.id,
              }),
          },
          rendered: true,
          visibleProjectionState: contentVisibleState,
        };
      },
      prepareMotionProjectionFrame: ({
        publicationDecision,
        publicationFrameContext,
      }) => {
        phases.push(
          `motion:${publicationDecision.lane}:viewport=${publicationFrameContext.viewportFrame}:defer=${publicationFrameContext.deferResolutionUpdates}`,
        );
        return {
          frame: {
            blockedPublicationCandidate: null,
            rendered: false,
            visibleProjectionState: null,
          },
          kind: "not-rendered",
        };
      },
      publish: (transaction) => {
        phases.push(`publish:${transaction.outcome.kind}`);
      },
      sampleVisibleFramePublication: () =>
        visibleFramePublicationSample({ sample }),
      scheduler,
    });

    expect(phases).toEqual([
      "motion:content:viewport=false:defer=false",
      "content:no-motion:viewport=false:defer=false",
      "publish:commit",
    ]);
    expect(result.outcome.kind).toBe("commit");
    expect(result.preparedFrame.visibleFrameEngineOutcome?.kind).toBe(
      "presented",
    );
    expect(
      result.preparedFrame.visibleFrameEnginePreparedFrame?.candidate
        .projectionSampleId,
    ).toBe(sample.id);
    expect(result.preparedFrame.contentPublicationFrame.rendered).toBe(true);
    expect(result.preparedFrame.visibleProjectionState).toBe(
      contentVisibleState,
    );
    expect(result.preparedFrame.transactionOracle.visibleProjectionSource).toBe(
      "content-publication",
    );
    expect(result.preparedFrame.transactionOracle.commitOracle).toEqual(
      expect.objectContaining({
        actorProofDigest: "[]",
        debtProof: { content: true, maintenance: false, motion: false },
      }),
    );
    if (result.outcome.kind !== "commit") {
      throw new Error("Expected visible frame publication to commit.");
    }
    expect(result.outcome.token).toEqual(
      expect.objectContaining({
        committedFrameId: contentVisibleState.committedFrame.displayFrameId,
        projectionSampleId: sample.id,
      }),
    );
  });

  it("binds retained projection decisions to the kernel sample, reasons, and previous frame", () => {
    const scheduler = createGpuFlowVisiblePublicationScheduler();
    const sample = liveProjectionSample({ id: 54, timestamp: 540 });
    const previousVisibleProjectionState = visibleProjectionState({
      kind: "motion-projection",
      sample: liveProjectionSample({ id: 53, timestamp: 524 }),
    });
    const requestedTransaction = retainedProjectionTransaction({ sample });
    const blockedCandidates: GpuFlowVisibleFrameBlockedPublicationCandidate[] =
      [];

    type TestContentPublicationFrame = {
      readonly blockedPublicationCandidate: null;
      readonly rendered: boolean;
      readonly visibleProjectionState: null;
    };
    type TestMotionProjectionFrame = {
      readonly blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate | null;
      readonly rendered: boolean;
      readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
    };
    const result = runGpuFlowVisibleFramePublicationCandidateSetKernel<
      TestContentPublicationFrame,
      TestMotionProjectionFrame
    >({
      prepareContentPublicationFrame: () => ({
        blockedPublicationCandidate: null,
        rendered: false,
        visibleProjectionState: null,
      }),
      prepareMotionProjectionFrame: ({
        previousVisibleProjectionState: kernelPreviousVisibleProjectionState,
      }) => {
        expect(kernelPreviousVisibleProjectionState).toBe(
          previousVisibleProjectionState,
        );
        return {
          createBlockedProjectionFrame: ({ blockedPublicationCandidate }) => {
            blockedCandidates.push(blockedPublicationCandidate);
            return {
              blockedPublicationCandidate,
              rendered: false,
              visibleProjectionState: null,
            };
          },
          hasActiveRetainedDomControl: false,
          kind: "render",
          requestedTransaction,
          resolveRetainedProjectionFrame: () =>
            retainedProjectionFrame({
              missingCoverageSurfaceIds: ["surface-a"],
            }),
          renderProjectionFrame: ({ projectionFrameRenderPlan }) => {
            return {
              blockedPublicationCandidate: null,
              rendered: true,
              visibleProjectionState: visibleProjectionState({
                heldPreviousProjection:
                  projectionFrameRenderPlan.heldPreviousProjection,
                kind: projectionFrameRenderPlan.transaction.kind,
                sample: projectionFrameRenderPlan.transaction.sample,
                transaction: projectionFrameRenderPlan.transaction,
              }),
            };
          },
        };
      },
      publish: () => {},
      sampleVisibleFramePublication: () =>
        visibleFramePublicationSample({
          previousVisibleProjectionState,
          rawReasons: ["retained-scroll"],
          sample,
        }),
      scheduler,
    });

    expect(blockedCandidates).toEqual([]);
    const selectedTransaction =
      result.preparedFrame.motionProjectionFrame.visibleProjectionState
        ?.transaction;
    if (!selectedTransaction) {
      throw new Error("Expected retained projection transaction selection.");
    }
    expect(selectedTransaction.kind).toBe("held-previous");
    expect(selectedTransaction.rawReasons).toEqual(["retained-scroll"]);
    expect(selectedTransaction.sample).toBe(sample);
    expect(selectedTransaction.committedFrameId).toBe(
      previousVisibleProjectionState.committedFrame.displayFrameId,
    );
    expect(result.preparedFrame.visibleFrameEngineOutcome?.kind).toBe("held");
    expect(
      result.preparedFrame.visibleFrameEngineOutcome?.decidingProof,
    ).toEqual(
      expect.objectContaining({
        reason: "held-previous",
      }),
    );
  });

  it("supplies a content publication stage runner from the kernel", () => {
    const scheduler = createGpuFlowVisiblePublicationScheduler();
    const sample = liveProjectionSample({ id: 55, timestamp: 550 });
    let suppliedRunner = false;
    runGpuFlowVisibleFramePublicationCandidateSetKernel({
      prepareContentPublicationFrame: (input) => {
        suppliedRunner = true;
        expect(
          typeof input.runRetainedCommittedSurfacePublicationContentStage,
        ).toBe("function");
        expect(input).not.toHaveProperty(
          "prepareCommittedSurfacePublicationFramePlan",
        );
        expect(input).not.toHaveProperty(
          "prepareRetainedDisplayPublicationFramePlan",
        );
        return {
          blockedPublicationCandidate: null,
          rendered: true,
          visibleProjectionState: null,
        };
      },
      prepareMotionProjectionFrame: () => ({
        frame: {
          blockedPublicationCandidate: null,
          rendered: false,
          visibleProjectionState: null,
        },
        kind: "not-rendered",
      }),
      publish: () => {},
      sampleVisibleFramePublication: () =>
        visibleFramePublicationSample({ sample }),
      scheduler,
    });
    expect(suppliedRunner).toBe(true);
  });

  it("computes retained resolution deferral inside the kernel frame context", () => {
    const cases = [
      {
        expected: true,
        lane: "content",
        runtimeViewportFrame: false,
        schedulerState: "motion-settling",
        viewportInteractionActive: false,
      },
      {
        expected: true,
        lane: "maintenance",
        runtimeViewportFrame: true,
        schedulerState: "idle",
        viewportInteractionActive: false,
      },
      {
        expected: false,
        lane: "content",
        runtimeViewportFrame: false,
        schedulerState: "content-catchup",
        viewportInteractionActive: false,
      },
    ] as const;

    for (const testCase of cases) {
      const observed: boolean[] = [];
      runGpuFlowVisibleFramePublicationCandidateSetKernel({
        prepareContentPublicationFrame: ({ publicationFrameContext }) => {
          observed.push(publicationFrameContext.deferResolutionUpdates);
          return testPublicationCandidate();
        },
        prepareMotionProjectionFrame: ({ publicationFrameContext }) => {
          observed.push(publicationFrameContext.deferResolutionUpdates);
          return {
            frame: testPublicationCandidate(),
            kind: "not-rendered" as const,
          };
        },
        publish: () => {},
        sampleVisibleFramePublication: () =>
          visibleFramePublicationSample({
            runtimeViewportFrame: testCase.runtimeViewportFrame,
            sample: liveProjectionSample({ id: 57, timestamp: 570 }),
            viewportInteractionActive: testCase.viewportInteractionActive,
          }),
        scheduler: fixedPublicationScheduler({
          lane: testCase.lane,
          schedulerState: testCase.schedulerState,
        }),
      });

      expect(observed).toEqual([testCase.expected, testCase.expected]);
    }
  });

  it("uses one commit oracle for compatible-previous proof reports and debt", () => {
    const scheduler = createGpuFlowVisiblePublicationScheduler();
    const publicationDecision = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveProjectionSample({ id: 51, timestamp: 510 }),
      timestamp: 510,
      viewportInteractionActive: false,
    });

    const oracle = createGpuFlowVisiblePublicationCommitOracle({
      committedFrame: committedSurfaceFrameWithCompatiblePreviousCoverage(),
      publicationDecision,
    });

    expect(publicationDecision.lane).toBe("content");
    expect(oracle.hasCompatiblePreviousCoverage).toBe(true);
    expect(oracle.debtProof).toEqual({
      content: false,
      maintenance: false,
      motion: false,
    });
    expect(oracle.remainingActorDebt).toEqual([
      {
        actorId: "actor-a",
        canonicalActorId: "canonical-text-a",
        ownerFamily: "text-like-dom-control",
        remainingDebt: ["exact-browser-visual"],
      },
    ]);
    expect(oracle.browserActorProofs).toEqual(
      expect.objectContaining({
        actorCount: 1,
        actualInteraction: { "inactive-visual-only": 1 },
        actualVisual: { "compatible-previous": 1 },
      }),
    );
    expect(oracle.compatiblePreviousProofs).toEqual(
      expect.objectContaining({
        actorCount: 1,
        maxObservedProofAgeFrames: 1,
        maxObservedProofAgeMs: 16,
        overBudgetActorIds: [],
      }),
    );
    expect(oracle.coverage).toEqual(
      expect.objectContaining({
        compatibleCoverageCount: 1,
        exactCoverageCount: 0,
        protectedResourceCount: 1,
      }),
    );
  });

  it.each([
    {
      blockedSource: "compatible-previous-proof" as const,
      frameInput: { budgetState: "over-budget" as const },
      reason: {
        actorId: "actor-a",
        family: "compatible-previous",
        reason: "compatible-previous-budget-exceeded",
      },
    },
    {
      blockedSource: "actor-proof" as const,
      frameInput: {
        actualInteractionProof: "active-editor-live",
        requiredInteractionProof: "active-editor-live",
      },
      reason: {
        actorId: "actor-a",
        family: "active-editor",
        reason: "active-editor-live-proof-required",
      },
    },
  ])(
    "blocks $blockedSource compatible-previous proof before publishing a commit token",
    ({ blockedSource, frameInput, reason }) => {
      const scheduler = createGpuFlowVisiblePublicationScheduler();
      const sample = liveProjectionSample({ id: 53, timestamp: 530 });
      const previousVisibleProjectionState = visibleProjectionState({
        kind: "content-publication",
        sample: liveProjectionSample({ id: 52, timestamp: 514 }),
      });
      const contentVisibleState = visibleProjectionState({
        committedFrame:
          committedSurfaceFrameWithCompatiblePreviousCoverage(frameInput),
        kind: "content-publication",
        sample,
      });
      let publishedOutcome: string | null = null;

      const result = runPreparedCandidateKernel({
        contentFrame: testPublicationCandidate({
          rendered: true,
          visibleProjectionState: contentVisibleState,
        }),
        previousVisibleProjectionState,
        publish: (transaction) => {
          publishedOutcome = transaction.outcome.kind;
        },
        sample,
        scheduler,
      });

      expect(result.outcome.kind).toBe("blocked");
      expect(publishedOutcome).toBe("blocked");
      expect(result.preparedFrame.transactionOracle.blockedSource).toBe(
        blockedSource,
      );
      expect(result.preparedFrame.transactionOracle.commitOracle).toBeNull();
      if (result.outcome.kind !== "blocked") {
        throw new Error("Expected compatible previous proof block.");
      }
      expect(result.outcome.token.frozenFrameId).toBe(
        previousVisibleProjectionState.committedFrame.displayFrameId,
      );
      expect(result.outcome.token.blockedReasons).toEqual([reason]);
    },
  );

  it("lets the engine hold a proof-blocked candidate when the previous frame covers the actors", () => {
    const scheduler = createGpuFlowVisiblePublicationScheduler();
    const sample = liveProjectionSample({ id: 531, timestamp: 5310 });
    const previousVisibleProjectionState = visibleProjectionState({
      committedFrame: committedSurfaceFrameWithCompatiblePreviousCoverage(),
      kind: "content-publication",
      sample: liveProjectionSample({ id: 530, timestamp: 5294 }),
    });
    const contentVisibleState = visibleProjectionState({
      committedFrame: committedSurfaceFrameWithCompatiblePreviousCoverage({
        budgetState: "over-budget",
      }),
      kind: "content-publication",
      sample,
    });

    const result = runPreparedCandidateKernel({
      contentFrame: testPublicationCandidate({
        rendered: true,
        visibleProjectionState: contentVisibleState,
      }),
      previousVisibleProjectionState,
      sample,
      scheduler,
    });

    expect(result.preparedFrame.transactionOracle.blockedSource).toBe(
      "compatible-previous-proof",
    );
    expect(result.preparedFrame.visibleFrameEngineOutcome?.kind).toBe("held");
    expect(
      result.preparedFrame.visibleFrameEngineOutcome?.decidingProof,
    ).toEqual(
      expect.objectContaining({
        reason: "compatible-previous-budget-exceeded",
      }),
    );
    expect(result.outcome.kind).toBe("hold-previous");
  });

  it("keeps selected content debt queued for blocked transactions", () => {
    const scheduler = createGpuFlowVisiblePublicationScheduler();
    const result = runPreparedCandidateKernel({
      contentFrame: testPublicationCandidate({
        blockedPublicationCandidate: {
          blockedReasons: [
            {
              actorId: "actor-a",
              family: "dom-control",
              reason: "snapshot-pending",
            },
          ],
          frozenFrameId: GPU_FLOW_BROWSER_VISUAL_COLD_START_SHELL_FRAME_ID,
        },
      }),
      sample: liveProjectionSample({ id: 2, timestamp: 20 }),
      scheduler,
    });

    expect(result.publicationDecision.lane).toBe("content");
    expect(result.outcome.kind).toBe("blocked");
    if (result.outcome.kind !== "blocked") {
      throw new Error("Expected blocked transaction.");
    }
    expect(result.outcome.token.blockedReasons).toEqual([
      {
        actorId: "actor-a",
        family: "dom-control",
        reason: "snapshot-pending",
      },
    ]);
    expect(result.completeSchedulerFrame().completion.debt.content).toBe(true);
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
    "prepares a nonpublishable browser visual candidate for withheld proof $projectionCoverage",
    ({ actorFamily, projectionCoverage, readinessReason }) => {
      const previousVisibleProjectionState = visibleProjectionState({
        kind: "content-publication",
        sample: liveProjectionSample({ id: 20, timestamp: 200 }),
      });
      const candidate = prepareCommittedSurfacePublicationCandidateForTest({
        heldPreviousProjectionState: previousVisibleProjectionState,
        publishedCommittedSurfaceFrame: blockedCommittedSurfaceFrame({
          actorFamily,
          projectionCoverage,
          readinessReason,
        }),
      });

      expect(candidate.kind).toBe("nonpublishable");
      if (candidate.kind !== "nonpublishable") {
        throw new Error("Expected nonpublishable committed-surface candidate.");
      }
      expect(candidate.blockedPublicationCandidate.blockedReasons).toEqual([
        {
          actorId: "actor-a",
          family: actorFamily,
          reason: readinessReason,
        },
      ]);
      expect(readinessReason).toMatch(/live-dom-budget|snapshot-pending/);
    },
  );

  it("keeps over-budget withheld browser visual proof as a nonpublishable candidate", () => {
    const previousVisibleProjectionState = visibleProjectionState({
      kind: "held-previous",
      sample: liveProjectionSample({ id: 22, timestamp: 220 }),
    });
    const candidate = prepareCommittedSurfacePublicationCandidateForTest({
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

    expect(candidate.kind).toBe("nonpublishable");
    if (candidate.kind !== "nonpublishable") {
      throw new Error("Expected nonpublishable committed-surface candidate.");
    }
    expect(candidate.blockedPublicationCandidate.frozenFrameId).toBe(
      previousVisibleProjectionState.committedFrame.displayFrameId,
    );
    expect(candidate.blockedPublicationCandidate.blockedReasons).toEqual([
      {
        actorId: "actor-a",
        family: "dom-control",
        reason: "snapshot-pending",
      },
    ]);
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

function committedSurfaceFrameWithCompatiblePreviousCoverage({
  actualInteractionProof = "inactive-visual-only",
  budgetState = "within-budget",
  requiredInteractionProof = "inactive-visual-only",
}: {
  readonly actualInteractionProof?: string | undefined;
  readonly budgetState?: "over-budget" | "within-budget" | undefined;
  readonly requiredInteractionProof?: string | undefined;
} = {}): GpuFlowCommittedSurfaceFrame {
  return {
    ...committedSurfaceFrame(),
    actorGenerations: [
      {
        actorFamily: "text-like-dom-control",
        actorId: "actor-a",
        browserVisual: {
          proof: {
            actualInteraction: actualInteractionProof,
            actualVisual: "compatible-previous",
            requiredInteraction: requiredInteractionProof,
            requiredVisual: "browser-visual",
          },
          representation: {
            actorId: "actor-a",
            kind: "compatible-previous",
            previousTransactionId: "previous-transaction",
          },
        },
        canonicalActorId: "canonical-text-a",
        visibleNonempty: true,
        textCoverageProof: {
          compatiblePreviousProof: {
            budgetState,
            clipChainRevision: "clip-a",
            hitMappingCompatible: true,
            maxProofAgeFrames: 2,
            maxProofAgeMs: 120,
            previousActorGenerationId: "previous-generation-a",
            previousCommittedFrameId: 6,
            previousProjectionSampleRevision: "viewport-previous",
            previousTransactionId: "previous-transaction",
            previousVisualGenerationId: "previous-visual-a",
            proofAgeFrames: budgetState === "over-budget" ? 3 : 1,
            proofAgeMs: budgetState === "over-budget" ? 121 : 16,
            protectedResourceIds: ["source:actor-a"],
            reasonCode: "same-value-and-geometry",
            requestedActorGenerationId: "generation-a",
            requestedProjectionSampleRevision: "viewport-current",
            requestedVisualGenerationId: "generation-a",
            resourceHandles: [],
            retainedScrollCompatible: true,
          },
          projectionCoverage: "compatible-previous",
        },
      },
    ],
    projectionHorizon: {
      textActorCoverage: {
        blockedAwaitingBrowserVisualActorIds: [],
        blockedAwaitingLiveHostActorIds: [],
        compatiblePreviousActorIds: ["actor-a"],
        exactLiveDomActorIds: [],
        exactSnapshotActorIds: [],
        trueHoleActorIds: [],
      },
    },
    surfaceTransaction: {
      coverageProof: {
        blockingGenerationIds: [],
        blockingSurfaceIds: [],
        compatibleCoverage: [{ resourceHandles: [] }],
        exactCoverage: [],
        protectedResourceHandles: [
          { id: "source-a", kind: "source", reason: "compatible-previous" },
        ],
        rendererBuckets: [],
        trueHoleRects: [],
        visibleRects: [],
        zOrder: [],
      },
    },
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

function retainedProjectionTransaction({
  sample,
}: {
  readonly sample: GpuFlowLiveProjectionSample;
}) {
  return createGpuFlowProjectionTransactionForCommittedFrameId({
    committedFrameId: 12,
    kind: "motion-projection",
    lane: "motion",
    rawReasons: ["retained-scroll"],
    sample,
  });
}

function retainedProjectionFrame({
  missingCoverageSurfaceIds = [],
}: {
  readonly missingCoverageSurfaceIds?: readonly string[] | undefined;
} = {}) {
  return {
    flatSurfaces: [],
    missingCoverageSurfaceIds: new Set<string>(missingCoverageSurfaceIds),
    needsRetainedPageMaintenance: false,
  };
}

type TestPublicationCandidate = {
  readonly blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate | null;
  readonly rendered: boolean;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
};

function runPreparedCandidateKernel({
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
    typeof runGpuFlowVisibleFramePublicationCandidateSetKernel<
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
  return runGpuFlowVisibleFramePublicationCandidateSetKernel<
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

function fixedPublicationScheduler({
  lane,
  schedulerState,
}: {
  readonly lane: GpuFlowVisiblePublicationDecision["lane"];
  readonly schedulerState: GpuFlowVisiblePublicationDecision["schedulerState"];
}): ReturnType<typeof createGpuFlowVisiblePublicationScheduler> {
  const baseScheduler = createGpuFlowVisiblePublicationScheduler();
  return {
    completeFrame: (_decision, outcome) =>
      Object.freeze({
        debt: Object.freeze({
          content: lane !== "content",
          maintenance: lane !== "maintenance",
          motion: lane !== "motion",
        }),
        outcome: outcome.kind,
      }),
    getKnobs: baseScheduler.getKnobs,
    recordUncommittedFrame: (_decision, outcome) =>
      Object.freeze({
        debt: Object.freeze({
          content: lane !== "content",
          maintenance: lane !== "maintenance",
          motion: lane !== "motion",
        }),
        outcome: outcome.kind,
      }),
    selectFrame: ({ rawReasons, sample }): GpuFlowVisiblePublicationDecision =>
      Object.freeze({
        debt: Object.freeze({
          content: lane !== "content",
          maintenance: lane !== "maintenance",
          motion: lane !== "motion",
        }),
        lane,
        rawReasons: Object.freeze([...rawReasons]),
        sample,
        schedulerState,
      }),
  };
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

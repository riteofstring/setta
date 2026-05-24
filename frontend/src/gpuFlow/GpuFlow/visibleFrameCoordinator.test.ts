import { describe, expect, it } from "vitest";

import type { GpuFrameReason } from "../gpuRenderer";
import {
  createGpuFlowPreparedContentPresentationProof,
  type GpuFlowPreparedContentFrame,
} from "../preparedContentFrame";
import {
  createGpuFlowProjectionTransactionForPreparedContentFrameId,
  createGpuFlowVisibleFrameReducerRuntime,
  type GpuFlowLiveProjectionSample,
  type GpuFlowProjectionTransaction,
  type GpuFlowProjectionTransactionKind,
  type GpuFlowVisibleFrameReducerDecision,
  type GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import type { RetainedDisplayFrame } from "../retainedDisplayFrame";
import { createGpuFlowVisibleFramePresentationContentDecisionKernel } from "./visibleFrameActorAdapters/contentDecisionKernel";
import { createGpuFlowPreparedContentFramePublicationFramePlanPreparer } from "./visibleFrameContentPlan";
import {
  runGpuFlowVisibleFrameCoordinator,
  type GpuFlowVisibleFrameBlockedPublicationCandidate,
  type GpuFlowVisibleFramePublicationSample,
} from "./visibleFrameCoordinator";
import {
  createGpuFlowVisibleFramePresentationCanvasPresentationEvidence,
  createGpuFlowVisibleFramePresentationDomTransformPresentationEvidence,
  createGpuFlowVisibleFramePresentationTextureEvictionPresentationEvidence,
} from "./visibleFramePresentationEvidence";
import { createGpuFlowVisibleFramePresentableFrameProofFactory } from "./visibleFrameTransactionProofs";
import { GPU_FLOW_BROWSER_VISUAL_COLD_START_SHELL_FRAME_ID } from "./visibleFrameTypes";

const createGpuFlowVisibleFramePresentableFrameProofFromFactory =
  createGpuFlowVisibleFramePresentableFrameProofFactory();
const createGpuFlowVisibleFramePresentableFrameProof = ({
  preparedContentFrame,
  reducerDecision,
}: {
  readonly preparedContentFrame: GpuFlowPreparedContentFrame;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
}) => {
  const projectionTransactionId = `transaction:prepared-content:${reducerDecision.sample.id}`;
  return createGpuFlowVisibleFramePresentableFrameProofFromFactory({
    preparedContentFrame,
    presentationEvidence: {
      canvasGenerationEvidence:
        createGpuFlowVisibleFramePresentationCanvasPresentationEvidence({
          preparedContentFrame,
          projectionSampleId: reducerDecision.sample.id,
          projectionTransactionId,
        }),
      domTransformEvidence:
        createGpuFlowVisibleFramePresentationDomTransformPresentationEvidence({
          preparedContentFrame,
          projectionSampleId: reducerDecision.sample.id,
          projectionTransactionId,
        }),
      textureEvictionEvidence:
        createGpuFlowVisibleFramePresentationTextureEvictionPresentationEvidence(
          {
            preparedContentFrame,
            projectionSampleId: reducerDecision.sample.id,
            projectionTransactionId,
          },
        ),
    },
    reducerDecision,
    projectionTransactionKind: "prepared-content",
    projectionTransactionId,
  });
};
const preparePreparedContentFramePublicationFramePlanForTest =
  createGpuFlowPreparedContentFramePublicationFramePlanPreparer({
    contentDecisionKernel:
      createGpuFlowVisibleFramePresentationContentDecisionKernel(),
  });

describe("GPU Flow visible frame coordinator", () => {
  it("prepares motion and content candidate sets inside the coordinator before completion", () => {
    const scheduler = createGpuFlowVisibleFrameReducerRuntime();
    const sample = liveProjectionSample({ id: 50, timestamp: 500 });
    const contentVisibleState = visibleProjectionState({
      kind: "prepared-content",
      sample,
    });
    const phases: string[] = [];
    type TestContentPublicationFrame = {
      readonly blockedPublicationCandidate: null;
      readonly presentationEvidence: {
        readonly canvasGenerationEvidence: ReturnType<
          typeof createGpuFlowVisibleFramePresentationCanvasPresentationEvidence
        >;
        readonly domTransformEvidence: ReturnType<
          typeof createGpuFlowVisibleFramePresentationDomTransformPresentationEvidence
        >;
        readonly textureEvictionEvidence: ReturnType<
          typeof createGpuFlowVisibleFramePresentationTextureEvictionPresentationEvidence
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
    const result = runGpuFlowVisibleFrameCoordinator<
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
              createGpuFlowVisibleFramePresentationCanvasPresentationEvidence({
                preparedContentFrame: contentVisibleState.preparedContentFrame,
                projectionSampleId: contentVisibleState.sample.id,
                projectionTransactionId: contentVisibleState.transaction.id,
              }),
            domTransformEvidence:
              createGpuFlowVisibleFramePresentationDomTransformPresentationEvidence(
                {
                  preparedContentFrame:
                    contentVisibleState.preparedContentFrame,
                  projectionSampleId: contentVisibleState.sample.id,
                  projectionTransactionId: contentVisibleState.transaction.id,
                },
              ),
            textureEvictionEvidence:
              createGpuFlowVisibleFramePresentationTextureEvictionPresentationEvidence(
                {
                  preparedContentFrame:
                    contentVisibleState.preparedContentFrame,
                  projectionSampleId: contentVisibleState.sample.id,
                  projectionTransactionId: contentVisibleState.transaction.id,
                },
              ),
          },
          rendered: true,
          visibleProjectionState: contentVisibleState,
        };
      },
      prepareMotionProjectionFrame: ({
        reducerDecision,
        publicationFrameContext,
      }) => {
        phases.push(
          `motion:${reducerDecision.lane}:viewport=${publicationFrameContext.viewportFrame}:defer=${publicationFrameContext.deferResolutionUpdates}`,
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
      reducerRuntime: scheduler,
    });

    expect(phases).toEqual([
      "motion:content:viewport=false:defer=false",
      "content:no-motion:viewport=false:defer=false",
      "publish:present",
    ]);
    expect(result.outcome.kind).toBe("present");
    expect(result.preparedFrame.visibleFrameStateMachineOutcome?.kind).toBe(
      "presented",
    );
    expect(
      result.preparedFrame.visibleFrameStateMachinePreparedFrame?.candidate
        .projectionSampleId,
    ).toBe(sample.id);
    expect(result.preparedFrame.contentPublicationFrame.rendered).toBe(true);
    expect(result.preparedFrame.visibleProjectionState).toBe(
      contentVisibleState,
    );
    expect(result.preparedFrame.transactionProof.visibleProjectionSource).toBe(
      "prepared-content",
    );
    expect(result.preparedFrame.transactionProof.presentableFrameProof).toEqual(
      expect.objectContaining({
        actorProofDigest: "[]",
        debtProof: { content: true, maintenance: false, motion: false },
      }),
    );
    if (result.outcome.kind !== "present") {
      throw new Error("Expected visible frame publication to present.");
    }
    expect(result.outcome.token).toEqual(
      expect.objectContaining({
        preparedContentFrameId:
          contentVisibleState.preparedContentFrame.displayFrameId,
        projectionSampleId: sample.id,
      }),
    );
  });

  it("binds retained projection decisions to the coordinator sample, reasons, and previous frame", () => {
    const scheduler = createGpuFlowVisibleFrameReducerRuntime();
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
    const result = runGpuFlowVisibleFrameCoordinator<
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
      reducerRuntime: scheduler,
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
    expect(selectedTransaction.preparedContentFrameId).toBe(
      previousVisibleProjectionState.preparedContentFrame.displayFrameId,
    );
    expect(result.preparedFrame.visibleFrameStateMachineOutcome?.kind).toBe(
      "held",
    );
    expect(
      result.preparedFrame.visibleFrameStateMachineOutcome?.decidingProof,
    ).toEqual(
      expect.objectContaining({
        reason: "held-previous",
      }),
    );
  });

  it("supplies a content publication stage runner from the coordinator", () => {
    const scheduler = createGpuFlowVisibleFrameReducerRuntime();
    const sample = liveProjectionSample({ id: 55, timestamp: 550 });
    let suppliedRunner = false;
    runGpuFlowVisibleFrameCoordinator({
      prepareContentPublicationFrame: (input) => {
        suppliedRunner = true;
        expect(
          typeof input.runRetainedPreparedContentFramePublicationContentStage,
        ).toBe("function");
        expect(input).not.toHaveProperty(
          "preparePreparedContentFramePublicationFramePlan",
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
      reducerRuntime: scheduler,
    });
    expect(suppliedRunner).toBe(true);
  });

  it("uses one presentable frame proof for compatible-previous proof reports and debt", () => {
    const scheduler = createGpuFlowVisibleFrameReducerRuntime();
    const reducerDecision = scheduler.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveProjectionSample({ id: 51, timestamp: 510 }),
      timestamp: 510,
      viewportInteractionActive: false,
    });

    const proof = createGpuFlowVisibleFramePresentableFrameProof({
      preparedContentFrame:
        preparedContentFrameWithCompatiblePreviousCoverage(),
      reducerDecision,
    });

    expect(reducerDecision.lane).toBe("content");
    expect(proof.hasCompatiblePreviousCoverage).toBe(true);
    expect(proof.debtProof).toEqual({
      content: false,
      maintenance: false,
      motion: false,
    });
    expect(proof.remainingActorDebt).toEqual([
      {
        actorId: "actor-a",
        canonicalActorId: "canonical-text-a",
        ownerFamily: "text-like-dom-control",
        remainingDebt: ["exact-browser-visual"],
      },
    ]);
    expect(proof.browserActorProofs).toEqual(
      expect.objectContaining({
        actorCount: 1,
        actualInteraction: { "inactive-visual-only": 1 },
        actualVisual: { "compatible-previous": 1 },
      }),
    );
    expect(proof.compatiblePreviousProofs).toEqual(
      expect.objectContaining({
        actorCount: 1,
        maxObservedProofAgeFrames: 1,
        maxObservedProofAgeMs: 16,
        overBudgetActorIds: [],
      }),
    );
    expect(proof.coverage).toEqual(
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
    "blocks $blockedSource compatible-previous proof before publishing a presentation token",
    ({ blockedSource, frameInput, reason }) => {
      const scheduler = createGpuFlowVisibleFrameReducerRuntime();
      const sample = liveProjectionSample({ id: 53, timestamp: 530 });
      const previousVisibleProjectionState = visibleProjectionState({
        kind: "prepared-content",
        sample: liveProjectionSample({ id: 52, timestamp: 514 }),
      });
      const contentVisibleState = visibleProjectionState({
        preparedContentFrame:
          preparedContentFrameWithCompatiblePreviousCoverage(frameInput),
        kind: "prepared-content",
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
        reducerRuntime: scheduler,
      });

      expect(result.outcome.kind).toBe("blocked");
      expect(publishedOutcome).toBe("blocked");
      expect(result.preparedFrame.transactionProof.blockedSource).toBe(
        blockedSource,
      );
      expect(
        result.preparedFrame.transactionProof.presentableFrameProof,
      ).toBeNull();
      if (result.outcome.kind !== "blocked") {
        throw new Error("Expected compatible previous proof block.");
      }
      expect(result.outcome.token.frozenFrameId).toBe(
        previousVisibleProjectionState.preparedContentFrame.displayFrameId,
      );
      expect(result.outcome.token.blockedReasons).toEqual([reason]);
    },
  );

  it("lets the state machine hold a proof-blocked candidate when the previous frame covers the actors", () => {
    const scheduler = createGpuFlowVisibleFrameReducerRuntime();
    const sample = liveProjectionSample({ id: 531, timestamp: 5310 });
    const previousVisibleProjectionState = visibleProjectionState({
      preparedContentFrame:
        preparedContentFrameWithCompatiblePreviousCoverage(),
      kind: "prepared-content",
      sample: liveProjectionSample({ id: 530, timestamp: 5294 }),
    });
    const contentVisibleState = visibleProjectionState({
      preparedContentFrame: preparedContentFrameWithCompatiblePreviousCoverage({
        budgetState: "over-budget",
      }),
      kind: "prepared-content",
      sample,
    });

    const result = runPreparedCandidateKernel({
      contentFrame: testPublicationCandidate({
        rendered: true,
        visibleProjectionState: contentVisibleState,
      }),
      previousVisibleProjectionState,
      sample,
      reducerRuntime: scheduler,
    });

    expect(result.preparedFrame.transactionProof.blockedSource).toBe(
      "compatible-previous-proof",
    );
    expect(result.preparedFrame.visibleFrameStateMachineOutcome?.kind).toBe(
      "held",
    );
    expect(
      result.preparedFrame.visibleFrameStateMachineOutcome?.decidingProof,
    ).toEqual(
      expect.objectContaining({
        reason: "compatible-previous-budget-exceeded",
      }),
    );
    expect(result.outcome.kind).toBe("hold-previous");
  });

  it("keeps selected content debt queued for blocked transactions", () => {
    const scheduler = createGpuFlowVisibleFrameReducerRuntime();
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
      reducerRuntime: scheduler,
    });

    expect(result.reducerDecision.lane).toBe("content");
    expect(result.outcome.kind).toBe("blocked");
    if (result.outcome.kind !== "blocked") {
      throw new Error("Expected blocked transaction.");
    }
    expect(result.outcome.token.blockedReasons).toEqual([
      {
        actorId: null,
        family: "browser-visual",
        reason: "snapshot-pending",
      },
    ]);
    expect(result.outcome.token.frozenFrameId).toBe(
      GPU_FLOW_BROWSER_VISUAL_COLD_START_SHELL_FRAME_ID,
    );
    expect(result.completeReducerFrame().completion.debt.content).toBe(true);
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
        kind: "prepared-content",
        sample: liveProjectionSample({ id: 20, timestamp: 200 }),
      });
      const candidate = preparePreparedContentFramePublicationCandidateForTest({
        heldPreviousProjectionState: previousVisibleProjectionState,
        preparedContentFrame: blockedPreparedContentFrame({
          actorFamily,
          projectionCoverage,
          readinessReason,
        }),
      });

      expect(candidate.kind).toBe("nonpublishable");
      if (candidate.kind !== "nonpublishable") {
        throw new Error(
          "Expected nonpublishable prepared-content-frame candidate.",
        );
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
    const candidate = preparePreparedContentFramePublicationCandidateForTest({
      heldPreviousProjectionState: {
        ...previousVisibleProjectionState,
        heldPreviousProjection: {
          ...previousVisibleProjectionState.heldPreviousProjection,
          maxHeldPreviousFramesExceeded: true,
          maxHeldPreviousMsExceeded: true,
        } as GpuFlowVisibleProjectionState["heldPreviousProjection"],
      },
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
    expect(candidate.blockedPublicationCandidate.frozenFrameId).toBe(
      previousVisibleProjectionState.preparedContentFrame.displayFrameId,
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

function preparedContentFrameWithCompatiblePreviousCoverage({
  actualInteractionProof = "inactive-visual-only",
  budgetState = "within-budget",
  requiredInteractionProof = "inactive-visual-only",
}: {
  readonly actualInteractionProof?: string | undefined;
  readonly budgetState?: "over-budget" | "within-budget" | undefined;
  readonly requiredInteractionProof?: string | undefined;
} = {}): GpuFlowPreparedContentFrame {
  return {
    ...createPreparedContentFrame(),
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
            previousContentFrameId: 6,
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
  return createGpuFlowProjectionTransactionForPreparedContentFrameId({
    preparedContentFrameId: 12,
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
    prepareContentPublicationFrame: () => contentFrame,
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
  hasPresentedContentFrame = true,
  previousVisibleProjectionState = null,
  rawReasons = ["manual"],
  runtimeViewportFrame = false,
  sample,
  timestamp = sample.timestamp,
  visibleFrameResourceGraphSnapshot,
  viewportInteractionActive = false,
}: VisibleFramePublicationSampleInput): GpuFlowVisibleFramePublicationSample {
  return {
    hasPresentedContentFrame,
    previousVisibleProjectionState,
    rawReasons,
    runtimeViewportFrame,
    sample,
    timestamp,
    visibleFrameResourceGraphSnapshot,
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

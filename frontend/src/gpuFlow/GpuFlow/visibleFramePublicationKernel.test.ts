import { describe, expect, it } from "vitest";

import {
  createGpuFlowCommittedSurfacePresentationProof,
  type GpuFlowCommittedSurfaceFrame,
} from "../committedSurfaceFrame";
import {
  createGpuFlowProjectionTransactionForCommittedFrameId,
  createGpuFlowVisiblePublicationScheduler,
  type GpuFlowLiveProjectionSample,
  type GpuFlowProjectionTransactionKind,
  type GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import type { RetainedDisplayFrame } from "../retainedDisplayFrame";
import { GPU_FLOW_BROWSER_VISUAL_COLD_START_SHELL_FRAME_ID } from "./visibleFramePublicationAuthority";
import {
  createGpuFlowCommittedSurfaceHeldPreviousPublicationTransaction,
  decideGpuFlowCommittedSurfacePublicationTransaction,
} from "./visibleFramePublicationCommittedSurfaceAuthority";
import {
  completeGpuFlowVisibleFramePublicationTransaction,
  createGpuFlowRetainedProjectionBlockedPublicationCandidate,
  createGpuFlowVisibleFrameBlockedPublicationToken,
  createGpuFlowVisiblePublicationCommitOracle,
  decideGpuFlowRetainedProjectionPublicationTransaction,
  runGpuFlowVisibleFramePublicationCandidateSetKernel,
  type GpuFlowVisibleFramePublicationSample,
} from "./visibleFramePublicationKernel";

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
    expect(result.preparedFrame.presentableCommit).toEqual(
      expect.objectContaining({
        committedFrameId: contentVisibleState.committedFrame.displayFrameId,
        projectionSampleId: sample.id,
      }),
    );
    expect(result.preparedFrame.transactionOracle.presentableCommit).toBe(
      result.preparedFrame.presentableCommit,
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
    const selectedTransactions: GpuFlowVisibleProjectionState["transaction"][] =
      [];

    runGpuFlowVisibleFramePublicationCandidateSetKernel({
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
          createBlockedProjectionFrame: () => {
            throw new Error("Within-budget projection should hold.");
          },
          hasActiveRetainedDomControl: false,
          kind: "render",
          requestedProjectionCoverageMissing: true,
          requestedProjectionFrame: retainedProjectionFrame(),
          requestedTransaction,
          resolveHeldRetainedProjectionFrame: () => retainedProjectionFrame(),
          renderProjectionFrame: ({ projectionFrameRenderPlan }) => {
            selectedTransactions.push(projectionFrameRenderPlan.transaction);
            return {
              blockedPublicationCandidate: null,
              rendered: true,
              visibleProjectionState: visibleProjectionState({
                kind: "held-previous",
                sample,
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

    const selectedTransaction = selectedTransactions[0];
    if (!selectedTransaction) {
      throw new Error("Expected retained projection transaction selection.");
    }
    expect(selectedTransaction.kind).toBe("held-previous");
    expect(selectedTransaction.rawReasons).toEqual(["retained-scroll"]);
    expect(selectedTransaction.sample).toBe(sample);
    expect(selectedTransaction.committedFrameId).toBe(
      previousVisibleProjectionState.committedFrame.displayFrameId,
    );
  });

  it("supplies content publication plan preparers from the kernel", () => {
    const scheduler = createGpuFlowVisiblePublicationScheduler();
    const sample = liveProjectionSample({ id: 55, timestamp: 550 });
    const committedFrame = committedSurfaceFrame();
    const contentVisibleState = visibleProjectionState({
      kind: "content-publication",
      sample,
    });
    runGpuFlowVisibleFramePublicationCandidateSetKernel({
      prepareContentPublicationFrame: ({
        prepareCommittedSurfacePublicationFramePlan,
        prepareRetainedDisplayPublicationFramePlan,
      }) => {
        const committedPreparation =
          prepareCommittedSurfacePublicationFramePlan({
            committedGpuNativeVisuals: undefined,
            frameReasons: ["manual"],
            heldPreviousProjectionState: null,
            liveProjectionSample: sample,
            publicationLane: "content",
            publishedCommittedSurfaceFrame: committedFrame,
            publishedRetainedFrame: retainedDisplayFrame(),
          });
        expect(committedPreparation.framePlan.kind).toBe("publish");
        expect(typeof prepareRetainedDisplayPublicationFramePlan).toBe(
          "function",
        );
        return {
          blockedPublicationCandidate: null,
          rendered: true,
          visibleProjectionState: contentVisibleState,
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

  it("holds retained projection coverage misses inside the kernel while within budget", () => {
    const requestedTransaction = retainedProjectionTransaction({
      sample: liveProjectionSample({ id: 60, timestamp: 600 }),
    });
    const decision = decideGpuFlowRetainedProjectionPublicationTransaction({
      frameReasons: ["retained-scroll"],
      hasActiveRetainedDomControl: false,
      heldPreviousProjectionState: visibleProjectionState({
        kind: "motion-projection",
        sample: liveProjectionSample({ id: 59, timestamp: 584 }),
      }),
      requestedProjectionCoverageMissing: true,
      requestedTransaction,
    });

    expect(decision.kind).toBe("held-previous");
    expect(decision.blockedReason).toBeNull();
    expect(decision.transaction.kind).toBe("held-previous");
    expect(decision.transaction.committedFrameId).toBe(7);
    expect(decision.transaction.sample.id).toBe(60);
    expect(decision.heldPreviousProjection).toEqual(
      expect.objectContaining({
        consecutiveFrameCount: 1,
        projectionSampleId: 60,
        reason: "retained-projection-coverage-missing",
        requestedProjectionSampleId: 60,
      }),
    );
  });

  it("blocks retained projection held-previous after the kernel budget is exceeded", () => {
    const knobs = {
      maxConsecutiveMotionFramesBeforeContentProbe: 6,
      maxContentInterleaveMs: 2,
      maxHeldPreviousFrames: 1,
      maxHeldPreviousMs: 5,
      maxMaintenanceInterleaveMs: 1,
      motionSettleWindowMs: 120,
    };
    const firstDecision = decideGpuFlowRetainedProjectionPublicationTransaction(
      {
        frameReasons: ["retained-scroll"],
        hasActiveRetainedDomControl: false,
        heldPreviousProjectionState: visibleProjectionState({
          kind: "motion-projection",
          sample: liveProjectionSample({ id: 61, timestamp: 610 }),
        }),
        projectionSchedulerKnobs: knobs,
        requestedProjectionCoverageMissing: true,
        requestedTransaction: retainedProjectionTransaction({
          sample: liveProjectionSample({ id: 62, timestamp: 612 }),
        }),
      },
    );
    if (firstDecision.kind !== "held-previous") {
      throw new Error("Expected first retained projection decision to hold.");
    }

    const secondDecision =
      decideGpuFlowRetainedProjectionPublicationTransaction({
        frameReasons: ["retained-scroll"],
        hasActiveRetainedDomControl: false,
        heldPreviousProjectionState: {
          ...visibleProjectionState({
            kind: "held-previous",
            sample: firstDecision.transaction.sample,
          }),
          heldPreviousProjection: firstDecision.heldPreviousProjection,
          transaction: firstDecision.transaction,
        },
        projectionSchedulerKnobs: knobs,
        requestedProjectionCoverageMissing: true,
        requestedTransaction: retainedProjectionTransaction({
          sample: liveProjectionSample({ id: 70, timestamp: 620 }),
        }),
      });

    expect(secondDecision.kind).toBe("blocked");
    expect(secondDecision.blockedReason).toBe("held-previous-budget-exceeded");
    expect(secondDecision.transaction.kind).toBe("motion-projection");
    expect(secondDecision.transaction.sample.id).toBe(70);
    expect(secondDecision.heldPreviousProjection).toEqual(
      expect.objectContaining({
        consecutiveFrameCount: 2,
        heldDurationMs: 8,
        maxHeldPreviousFramesExceeded: true,
        maxHeldPreviousMsExceeded: true,
      }),
    );
  });

  it("projects requested retained coverage after the hold budget when an active DOM control is waiting", () => {
    const requestedTransaction = retainedProjectionTransaction({
      sample: liveProjectionSample({ id: 72, timestamp: 720 }),
    });
    const previousVisibleProjectionState = visibleProjectionState({
      kind: "held-previous",
      sample: liveProjectionSample({ id: 71, timestamp: 704 }),
    });
    if (!previousVisibleProjectionState.heldPreviousProjection) {
      throw new Error("Expected held-previous projection diagnostics.");
    }

    const decision = decideGpuFlowRetainedProjectionPublicationTransaction({
      frameReasons: ["retained-scroll"],
      hasActiveRetainedDomControl: true,
      heldPreviousProjectionState: {
        ...previousVisibleProjectionState,
        heldPreviousProjection: {
          ...previousVisibleProjectionState.heldPreviousProjection,
          consecutiveFrameCount: 2,
          heldDurationMs: 128,
          maxHeldPreviousFramesExceeded: true,
          maxHeldPreviousMsExceeded: true,
        },
      },
      projectionSchedulerKnobs: {
        maxConsecutiveMotionFramesBeforeContentProbe: 6,
        maxContentInterleaveMs: 2,
        maxHeldPreviousFrames: 1,
        maxHeldPreviousMs: 5,
        maxMaintenanceInterleaveMs: 1,
        motionSettleWindowMs: 120,
      },
      requestedProjectionCoverageMissing: true,
      requestedTransaction,
    });

    expect(decision.kind).toBe("project-requested");
    expect(decision.blockedReason).toBeNull();
    expect(decision.heldPreviousProjection).toBeNull();
    expect(decision.transaction).toBe(requestedTransaction);
  });

  it("keeps selected content debt queued for blocked transactions", () => {
    const scheduler = createGpuFlowVisiblePublicationScheduler();
    const publicationDecision = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveProjectionSample({ id: 2, timestamp: 20 }),
      timestamp: 20,
      viewportInteractionActive: false,
    });
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
      commitOracle: null,
      presentableCommit: null,
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

  it("turns a no-frame attempt into a tokenized hold when a previous frame exists", () => {
    const scheduler = createGpuFlowVisiblePublicationScheduler();
    const previousVisibleProjectionState = visibleProjectionState({
      kind: "content-publication",
      sample: liveProjectionSample({ id: 4, timestamp: 40 }),
    });
    const publicationDecision = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["retained-scroll"],
      sample: liveProjectionSample({ id: 5, timestamp: 56 }),
      timestamp: 56,
      viewportInteractionActive: true,
    });

    const result = completeGpuFlowVisibleFramePublicationTransaction({
      blockedPublicationToken: null,
      commitOracle: null,
      presentableCommit: null,
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
    const publicationDecision = scheduler.selectFrame({
      hasCommittedContentFrame: false,
      rawReasons: ["manual"],
      sample: liveProjectionSample({ id: 6, timestamp: 72 }),
      timestamp: 72,
      viewportInteractionActive: false,
    });

    const result = completeGpuFlowVisibleFramePublicationTransaction({
      blockedPublicationToken: null,
      commitOracle: null,
      presentableCommit: null,
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
    const publicationDecision = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveProjectionSample({ id: 3, timestamp: 30 }),
      timestamp: 30,
      viewportInteractionActive: false,
    });

    const result = completeGpuFlowVisibleFramePublicationTransaction({
      blockedPublicationToken: null,
      commitOracle: null,
      presentableCommit: null,
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
    const publicationDecision = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveProjectionSample({ id: 33, timestamp: 330 }),
      timestamp: 330,
      viewportInteractionActive: false,
    });
    const heldVisibleProjectionState = visibleProjectionState({
      kind: "held-previous",
      sample: publicationDecision.sample,
    });
    if (!heldVisibleProjectionState.heldPreviousProjection) {
      throw new Error("Expected held-previous projection diagnostics.");
    }

    const result = completeGpuFlowVisibleFramePublicationTransaction({
      blockedPublicationToken: null,
      commitOracle: null,
      presentableCommit: null,
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
    const publicationDecision = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveProjectionSample({ id: 34, timestamp: 340 }),
      timestamp: 340,
      viewportInteractionActive: false,
    });
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
      commitOracle: null,
      presentableCommit: null,
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
    const publicationDecision = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveProjectionSample({ id: 4, timestamp: 64 }),
      timestamp: 64,
      viewportInteractionActive: false,
    });
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
      commitOracle: null,
      presentableCommit: null,
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

function committedSurfaceFrameWithCompatiblePreviousCoverage(): GpuFlowCommittedSurfaceFrame {
  return {
    ...committedSurfaceFrame(),
    actorGenerations: [
      {
        actorFamily: "text-like-dom-control",
        actorId: "actor-a",
        browserVisual: {
          proof: {
            actualInteraction: "inactive-visual-only",
            actualVisual: "compatible-previous",
            requiredInteraction: "inactive-visual-only",
            requiredVisual: "browser-visual",
          },
        },
        canonicalActorId: "canonical-text-a",
        visibleNonempty: true,
        textCoverageProof: {
          compatiblePreviousProof: {
            budgetState: "within-budget",
            hitMappingCompatible: true,
            maxProofAgeFrames: 2,
            maxProofAgeMs: 120,
            previousCommittedFrameId: 6,
            previousProjectionSampleRevision: "viewport-previous",
            proofAgeFrames: 1,
            proofAgeMs: 16,
            protectedResourceIds: ["source:actor-a"],
            reasonCode: "same-value-and-geometry",
            requestedProjectionSampleRevision: "viewport-current",
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

function retainedProjectionFrame() {
  return {
    flatSurfaces: [],
    missingCoverageSurfaceIds: new Set<string>(),
    needsRetainedPageMaintenance: false,
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

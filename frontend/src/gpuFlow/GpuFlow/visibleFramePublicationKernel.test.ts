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
  type GpuFlowProjectionSchedulerKnobs,
  type GpuFlowProjectionTransactionKind,
  type GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import type { RetainedDisplayFrame } from "../retainedDisplayFrame";
import { GPU_FLOW_BROWSER_VISUAL_COLD_START_SHELL_FRAME_ID } from "./visibleFramePublicationAuthority";
import { createGpuFlowRetainedProjectionBlockedPublicationCandidate } from "./visibleFramePublicationBlockedCandidate";
import {
  createGpuFlowRetainedProjectionPublicationDecisionSelector,
  createGpuFlowVisiblePublicationCommitOracleFactory,
  prepareGpuFlowCommittedSurfacePublicationCandidate,
  runGpuFlowVisibleFramePublicationCandidateSetKernel,
  type GpuFlowVisibleFrameBlockedPublicationCandidate,
  type GpuFlowVisibleFramePublicationSample,
} from "./visibleFramePublicationKernel";

const createGpuFlowVisiblePublicationCommitOracle =
  createGpuFlowVisiblePublicationCommitOracleFactory();

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

  it("holds retained projection coverage misses inside the kernel while within budget", () => {
    const requestedTransaction = retainedProjectionTransaction({
      sample: liveProjectionSample({ id: 60, timestamp: 600 }),
    });
    const decision = selectRetainedProjectionPublicationDecisionForTest({
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
    const firstDecision = selectRetainedProjectionPublicationDecisionForTest({
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
    });
    if (firstDecision.kind !== "held-previous") {
      throw new Error("Expected first retained projection decision to hold.");
    }

    const secondDecision = selectRetainedProjectionPublicationDecisionForTest({
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

    const decision = selectRetainedProjectionPublicationDecisionForTest({
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
      const candidate = prepareCommittedSurfacePublicationCandidateForTest({
        heldPreviousProjectionState: previousVisibleProjectionState,
        publishedCommittedSurfaceFrame: blockedCommittedSurfaceFrame({
          actorFamily,
          projectionCoverage,
          readinessReason,
        }),
      });

      expect(candidate.kind).toBe("held-previous");
      expect(readinessReason).toMatch(/live-dom-budget|snapshot-pending/);
    },
  );

  it("blocks withheld browser visual proof after the held-previous budget is exceeded", () => {
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

    expect(candidate.kind).toBe("blocked");
    if (candidate.kind !== "blocked") {
      throw new Error("Expected blocked committed-surface decision.");
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
    const sample = liveProjectionSample({ id: 5, timestamp: 56 });
    const result = runPreparedCandidateKernel({
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
    expect(result.completion.debt.motion).toBe(true);
  });

  it("turns a no-frame cold start into a blocked shell", () => {
    const scheduler = createGpuFlowVisiblePublicationScheduler();
    const result = runPreparedCandidateKernel({
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
    expect(result.completion.debt.content).toBe(true);
  });

  it("keeps selected content debt queued for held-previous transactions", () => {
    const scheduler = createGpuFlowVisiblePublicationScheduler();
    const sample = liveProjectionSample({ id: 3, timestamp: 30 });

    const heldVisibleProjectionState = visibleProjectionState({
      kind: "held-previous",
      sample,
    });
    const result = runPreparedCandidateKernel({
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
    expect(result.completion.debt.content).toBe(true);
  });

  it("blocks rendered held-previous transactions that exceed the kernel budget", () => {
    const scheduler = createGpuFlowVisiblePublicationScheduler();
    const sample = liveProjectionSample({ id: 33, timestamp: 330 });
    const heldVisibleProjectionState = visibleProjectionState({
      kind: "held-previous",
      sample,
    });
    if (!heldVisibleProjectionState.heldPreviousProjection) {
      throw new Error("Expected held-previous projection diagnostics.");
    }

    const result = runPreparedCandidateKernel({
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
        family: "visible-transaction",
        reason: "held-previous-budget-exceeded",
      },
    ]);
    expect(result.completion.debt.content).toBe(true);
  });

  it("creates committed-surface held-previous transaction state and mints its token at completion", () => {
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

    expect(candidate.kind).toBe("held-previous");
    if (candidate.kind !== "held-previous") {
      throw new Error("Expected held-previous committed-surface candidate.");
    }
    expect("token" in candidate).toBe(false);
    expect(candidate.visibleProjectionState.transaction.kind).toBe(
      "held-previous",
    );
    expect(candidate.visibleProjectionState.sample.id).toBe(sample.id);
    expect(candidate.visibleProjectionState.committedFrame.displayFrameId).toBe(
      previousVisibleProjectionState.committedFrame.displayFrameId,
    );

    const completion = runPreparedCandidateKernel({
      contentFrame: testPublicationCandidate({
        rendered: true,
        visibleProjectionState: candidate.visibleProjectionState,
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
  });
});

function visibleProjectionState({
  committedFrame = committedSurfaceFrame(),
  kind,
  sample,
}: {
  readonly committedFrame?: GpuFlowCommittedSurfaceFrame | undefined;
  readonly kind: GpuFlowProjectionTransactionKind;
  readonly sample: GpuFlowLiveProjectionSample;
}): GpuFlowVisibleProjectionState {
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
        },
        canonicalActorId: "canonical-text-a",
        visibleNonempty: true,
        textCoverageProof: {
          compatiblePreviousProof: {
            budgetState,
            hitMappingCompatible: true,
            maxProofAgeFrames: 2,
            maxProofAgeMs: 120,
            previousCommittedFrameId: 6,
            previousProjectionSampleRevision: "viewport-previous",
            proofAgeFrames: budgetState === "over-budget" ? 3 : 1,
            proofAgeMs: budgetState === "over-budget" ? 121 : 16,
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

function prepareCommittedSurfacePublicationCandidateForTest({
  heldPreviousProjectionState,
  liveSample = liveProjectionSample({ id: 21, timestamp: 216 }),
  publishedCommittedSurfaceFrame,
}: {
  readonly heldPreviousProjectionState: GpuFlowVisibleProjectionState | null;
  readonly liveSample?: GpuFlowLiveProjectionSample | undefined;
  readonly publishedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame;
}) {
  return prepareGpuFlowCommittedSurfacePublicationCandidate({
    committedGpuNativeVisuals: undefined,
    frameReasons: ["manual"],
    heldPreviousProjectionState,
    liveProjectionSample: liveSample,
    publicationLane: "content",
    publishedCommittedSurfaceFrame,
    publishedRetainedFrame: retainedDisplayFrame(),
  });
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

function selectRetainedProjectionPublicationDecisionForTest({
  hasActiveRetainedDomControl,
  heldPreviousProjectionState,
  projectionSchedulerKnobs,
  requestedProjectionCoverageMissing,
  requestedTransaction,
}: {
  readonly hasActiveRetainedDomControl: boolean;
  readonly heldPreviousProjectionState: GpuFlowVisibleProjectionState | null;
  readonly projectionSchedulerKnobs?:
    | GpuFlowProjectionSchedulerKnobs
    | undefined;
  readonly requestedProjectionCoverageMissing: boolean;
  readonly requestedTransaction: ReturnType<
    typeof retainedProjectionTransaction
  >;
}) {
  return createGpuFlowRetainedProjectionPublicationDecisionSelector({
    previousVisibleProjectionState: heldPreviousProjectionState,
    rawReasons: ["retained-scroll"],
  })({
    hasActiveRetainedDomControl,
    projectionSchedulerKnobs,
    requestedProjectionCoverageMissing,
    requestedTransaction,
  });
}

function retainedProjectionFrame() {
  return {
    flatSurfaces: [],
    missingCoverageSurfaceIds: new Set<string>(),
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

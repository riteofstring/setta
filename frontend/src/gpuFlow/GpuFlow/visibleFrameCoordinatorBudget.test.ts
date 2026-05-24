import { describe, expect, it } from "vitest";

import {
  createGpuFlowVisibleFrameRequestCoordinator,
  type GpuFlowLiveProjectionSample,
  type GpuFlowVisiblePublicationDecision,
} from "../projectionRuntime";
import { createGpuFlowVisibleFrameBudgetBroker } from "./visibleFrameBudgetBroker";
import {
  runGpuFlowVisibleFrameCoordinator,
  type GpuFlowVisibleFramePublicationFrameContext,
  type GpuFlowVisibleFramePublicationSample,
} from "./visibleFrameCoordinator";

describe("GPU Flow visible frame coordinator budget", () => {
  it("brokers retained resolution deferral inside the coordinator frame context", () => {
    const cases = [
      {
        expected: false,
        expectedResolutionDebtRequested: true,
        lane: "content",
        rawReasons: ["manual"],
        runtimeViewportFrame: false,
        schedulerState: "motion-settling",
        viewportInteractionActive: false,
      },
      {
        expected: false,
        expectedResolutionDebtRequested: true,
        lane: "maintenance",
        rawReasons: ["manual"],
        runtimeViewportFrame: true,
        schedulerState: "idle",
        viewportInteractionActive: false,
      },
      {
        expected: false,
        expectedResolutionDebtRequested: false,
        lane: "content",
        rawReasons: ["manual"],
        runtimeViewportFrame: true,
        schedulerState: "content-catchup",
        viewportInteractionActive: false,
      },
      {
        expected: false,
        expectedResolutionDebtRequested: false,
        lane: "content",
        rawReasons: ["manual"],
        runtimeViewportFrame: false,
        schedulerState: "content-catchup",
        viewportInteractionActive: false,
      },
      {
        expected: false,
        expectedResolutionDebtRequested: true,
        lane: "content",
        rawReasons: ["texture-upload", "manual"],
        runtimeViewportFrame: false,
        schedulerState: "content-catchup",
        viewportInteractionActive: false,
      },
      {
        expected: false,
        expectedResolutionDebtRequested: false,
        lane: "content",
        rawReasons: ["retained-scroll", "texture-upload"],
        runtimeViewportFrame: false,
        schedulerState: "motion-active",
        viewportInteractionActive: true,
      },
      {
        expected: false,
        expectedResolutionDebtRequested: false,
        lane: "content",
        rawReasons: ["texture-upload", "dom-control-activation"],
        runtimeViewportFrame: false,
        schedulerState: "content-catchup",
        viewportInteractionActive: false,
      },
    ] as const;

    for (const testCase of cases) {
      const observed: Array<{
        readonly deferResolutionUpdates: boolean;
        readonly resolutionDebtRequested: boolean;
      }> = [];
      runGpuFlowVisibleFrameCoordinator({
        prepareContentPublicationFrame: ({ publicationFrameContext }) => {
          observed.push(
            observeResolutionDeferralContext(publicationFrameContext),
          );
          return testPublicationCandidate();
        },
        prepareMotionProjectionFrame: ({ publicationFrameContext }) => {
          observed.push(
            observeResolutionDeferralContext(publicationFrameContext),
          );
          return {
            frame: testPublicationCandidate(),
            kind: "not-rendered" as const,
          };
        },
        publish: () => {},
        sampleVisibleFramePublication: () =>
          visibleFramePublicationSample({
            rawReasons: testCase.rawReasons,
            runtimeViewportFrame: testCase.runtimeViewportFrame,
            sample: liveProjectionSample({ id: 57, timestamp: 570 }),
            viewportInteractionActive: testCase.viewportInteractionActive,
          }),
        scheduler: fixedPublicationScheduler({
          lane: testCase.lane,
          schedulerState: testCase.schedulerState,
        }),
      });

      expect(observed).toEqual([
        {
          deferResolutionUpdates: testCase.expected,
          resolutionDebtRequested: testCase.expectedResolutionDebtRequested,
        },
        {
          deferResolutionUpdates: testCase.expected,
          resolutionDebtRequested: testCase.expectedResolutionDebtRequested,
        },
      ]);
    }

    const starvedObserved: boolean[] = [];
    runGpuFlowVisibleFrameCoordinator({
      budgetBroker: createGpuFlowVisibleFrameBudgetBroker({
        policy: {
          maxContinuityDebtAgeFrames: 2,
          maxSafetyDebtAgeFrames: 1,
          minPreparationBudgetDuringMotionMs: 0,
          perFramePreparationBudgetMs: 0,
          reservedMotionProjectionBudgetMs: 2,
        },
      }),
      prepareContentPublicationFrame: ({ publicationFrameContext }) => {
        starvedObserved.push(publicationFrameContext.deferResolutionUpdates);
        return testPublicationCandidate();
      },
      prepareMotionProjectionFrame: ({ publicationFrameContext }) => {
        starvedObserved.push(publicationFrameContext.deferResolutionUpdates);
        return {
          frame: testPublicationCandidate(),
          kind: "not-rendered" as const,
        };
      },
      publish: () => {},
      sampleVisibleFramePublication: () =>
        visibleFramePublicationSample({
          rawReasons: ["manual"],
          runtimeViewportFrame: false,
          sample: liveProjectionSample({ id: 58, timestamp: 580 }),
          viewportInteractionActive: false,
        }),
      scheduler: fixedPublicationScheduler({
        lane: "content",
        schedulerState: "motion-settling",
      }),
    });
    expect(starvedObserved).toEqual([true, true]);
  });

  it("starts budget-selected resource preparation after proofed publication", () => {
    const phases: string[] = [];

    runGpuFlowVisibleFrameCoordinator({
      budgetBroker: createGpuFlowVisibleFrameBudgetBroker({
        policy: {
          maxContinuityDebtAgeFrames: 2,
          maxSafetyDebtAgeFrames: 1,
          minPreparationBudgetDuringMotionMs: 0.5,
          perFramePreparationBudgetMs: 0.5,
          reservedMotionProjectionBudgetMs: 2,
        },
      }),
      prepareContentPublicationFrame: () => {
        phases.push("content");
        return testPublicationCandidate();
      },
      prepareMotionProjectionFrame: () => {
        phases.push("motion");
        return {
          frame: testPublicationCandidate(),
          kind: "not-rendered" as const,
        };
      },
      prepareVisibleFrameResourcesForBudget: (budgetDecision) => {
        phases.push(
          `resources:${budgetDecision.preparationBudget.selectedDebtIds.join(",")}`,
        );
      },
      publish: (transaction) => {
        phases.push(`publish:${transaction.outcome.kind}`);
      },
      sampleVisibleFramePublication: () =>
        visibleFramePublicationSample({
          sample: liveProjectionSample({ id: 59, timestamp: 590 }),
          visibleFrameResourceGraphSnapshot: {
            activeEditorPins: ["editor"],
            candidateResourceKeys: ["dom-control:editor"],
            committedFrameId: null,
            committedResourceKeys: [],
            pendingCandidateFrameIds: [88],
            queuedResourceKeys: ["dom-control:editor"],
            resourceDebtByState: {
              absent: 0,
              preparing: 0,
              presented: 0,
              ready: 0,
              requested: 1,
              retired: 0,
            },
            resourceStates: [
              {
                debtAgeFrames: 0,
                deadlineFrame: 1,
                estimatedCostMs: 0.5,
                ownerFrameId: 88,
                preparationLane: "browser-visual",
                priority: "safety",
                resourceKey: "dom-control:editor",
                state: "requested",
              },
            ],
          },
        }),
      scheduler: fixedPublicationScheduler({
        lane: "content",
        schedulerState: "content-catchup",
      }),
    });

    expect(phases).toEqual([
      "motion",
      "content",
      "publish:blocked",
      "resources:dom-control:editor",
    ]);
  });

  it("lets selected visible resource debt preempt an active motion lane", () => {
    const phases: string[] = [];

    const result = runGpuFlowVisibleFrameCoordinator({
      budgetBroker: createGpuFlowVisibleFrameBudgetBroker({
        policy: {
          maxContinuityDebtAgeFrames: 2,
          maxSafetyDebtAgeFrames: 1,
          minPreparationBudgetDuringMotionMs: 0.5,
          perFramePreparationBudgetMs: 0.5,
          reservedMotionProjectionBudgetMs: 2,
        },
      }),
      prepareContentPublicationFrame: ({
        contentPublicationWorkPlan,
        publicationFrameContext,
      }) => {
        phases.push(
          `content:${contentPublicationWorkPlan.kind}:defer-${publicationFrameContext.deferResolutionUpdates}`,
        );
        return testPublicationCandidate();
      },
      prepareMotionProjectionFrame: ({
        motionProjectionWorkPlan,
        publicationFrameContext,
      }) => {
        phases.push(
          `motion:${motionProjectionWorkPlan.kind}:defer-${publicationFrameContext.deferResolutionUpdates}`,
        );
        return {
          frame: testPublicationCandidate(),
          kind: "not-rendered" as const,
        };
      },
      publish: (transaction) => {
        phases.push(`publish:${transaction.publicationDecision.lane}`);
      },
      sampleVisibleFramePublication: () =>
        visibleFramePublicationSample({
          rawReasons: ["viewport"],
          runtimeViewportFrame: true,
          sample: liveProjectionSample({ id: 60, timestamp: 600 }),
          visibleFrameResourceGraphSnapshot: {
            activeEditorPins: ["editor"],
            candidateResourceKeys: ["dom-control:editor"],
            committedFrameId: null,
            committedResourceKeys: [],
            pendingCandidateFrameIds: [89],
            queuedResourceKeys: ["dom-control:editor"],
            resourceDebtByState: {
              absent: 0,
              preparing: 0,
              presented: 0,
              ready: 0,
              requested: 1,
              retired: 0,
            },
            resourceStates: [
              {
                debtAgeFrames: 0,
                deadlineFrame: 1,
                estimatedCostMs: 0.5,
                ownerFrameId: 89,
                preparationLane: "browser-visual",
                priority: "safety",
                resourceKey: "dom-control:editor",
                state: "requested",
              },
            ],
          },
          viewportInteractionActive: true,
        }),
      scheduler: fixedPublicationScheduler({
        lane: "motion",
        schedulerState: "motion-active",
      }),
    });

    expect(result.publicationDecision.lane).toBe("content");
    expect(result.publicationDecision.debt.motion).toBe(true);
    expect(
      result.publicationFrameContext.budgetDecision.preparationBudget,
    ).toMatchObject({
      selectedVisibleDebtIds: ["dom-control:editor"],
      selectedVisibleResourceDebtIds: ["dom-control:editor"],
    });
    expect(phases).toEqual([
      "motion:skip:defer-false",
      "content:prepare:defer-false",
      "publish:content",
    ]);
  });
});

function observeResolutionDeferralContext(
  publicationFrameContext: GpuFlowVisibleFramePublicationFrameContext,
): {
  readonly deferResolutionUpdates: boolean;
  readonly resolutionDebtRequested: boolean;
} {
  const selectedDebtIds =
    publicationFrameContext.budgetDecision.preparationBudget.selectedDebtIds;
  const deferredDebtIds =
    publicationFrameContext.budgetDecision.preparationBudget.deferredDebtIds;
  return {
    deferResolutionUpdates: publicationFrameContext.deferResolutionUpdates,
    resolutionDebtRequested:
      selectedDebtIds.includes("resolution-update") ||
      deferredDebtIds.includes("resolution-update"),
  };
}

function fixedPublicationScheduler({
  lane,
  schedulerState,
}: {
  readonly lane: GpuFlowVisiblePublicationDecision["lane"];
  readonly schedulerState: GpuFlowVisiblePublicationDecision["schedulerState"];
}): ReturnType<typeof createGpuFlowVisibleFrameRequestCoordinator> {
  const baseScheduler = createGpuFlowVisibleFrameRequestCoordinator();
  const debt = Object.freeze({
    content: false,
    maintenance: false,
    motion: false,
  });
  return {
    completeFrame: (_decision, outcome) =>
      Object.freeze({
        debt,
        outcome: outcome.kind,
      }),
    getKnobs: baseScheduler.getKnobs,
    recordUncommittedFrame: (_decision, outcome) =>
      Object.freeze({
        debt,
        outcome: outcome.kind,
      }),
    selectFrameRequest: ({
      hasCommittedContentFrame,
      rawReasons,
      sample,
      timestamp,
      viewportInteractionActive,
    }) =>
      Object.freeze({
        contentDebt: lane === "content",
        contentRetryDeferred: false,
        criticalContentDebt: lane === "content",
        hasCommittedContentFrame,
        maintenanceDebt: lane === "maintenance",
        motionDebt: lane === "motion",
        motionRetryDeferred: false,
        rawReasons: Object.freeze([...rawReasons]),
        sample,
        schedulerState,
        timestamp,
        viewportInteractionActive,
      }),
    selectFrame: ({ rawReasons, sample }): GpuFlowVisiblePublicationDecision =>
      Object.freeze({
        debt,
        lane,
        rawReasons: Object.freeze([...rawReasons]),
        sample,
        schedulerState,
      }),
  };
}

function testPublicationCandidate(): {
  readonly blockedPublicationCandidate: null;
  readonly rendered: boolean;
  readonly visibleProjectionState: null;
} {
  return {
    blockedPublicationCandidate: null,
    rendered: false,
    visibleProjectionState: null,
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
  visibleFrameResourceGraphSnapshot,
  viewportInteractionActive = false,
}: VisibleFramePublicationSampleInput): GpuFlowVisibleFramePublicationSample {
  return {
    hasCommittedContentFrame,
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
  } as GpuFlowLiveProjectionSample;
}

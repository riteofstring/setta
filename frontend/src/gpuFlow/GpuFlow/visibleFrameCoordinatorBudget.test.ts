import { describe, expect, it } from "vitest";

import {
  createGpuFlowVisibleFrameReducerRuntime,
  type GpuFlowLiveProjectionSample,
  type GpuFlowVisibleFrameReducerDecision,
} from "../projectionRuntime";
import { createGpuFlowVisibleFrameBudgetBroker } from "./visibleFrameBudgetBroker";
import {
  runGpuFlowVisibleFrameCoordinator,
  type GpuFlowVisibleFramePresentationFrameContext,
  type GpuFlowVisibleFramePresentationSample,
} from "./visibleFrameCoordinator";

describe("GPU Flow visible frame coordinator budget", () => {
  it("brokers retained resolution deferral inside the coordinator frame context", () => {
    const cases = [
      {
        expected: true,
        expectedResolutionDebtRequested: true,
        lane: "content",
        rawReasons: ["manual"],
        runtimeViewportFrame: false,
        reducerState: "motion-settling",
        viewportInteractionActive: false,
      },
      {
        expected: true,
        expectedResolutionDebtRequested: true,
        lane: "maintenance",
        rawReasons: ["manual"],
        runtimeViewportFrame: true,
        reducerState: "idle",
        viewportInteractionActive: false,
      },
      {
        expected: false,
        expectedResolutionDebtRequested: false,
        lane: "content",
        rawReasons: ["manual"],
        runtimeViewportFrame: true,
        reducerState: "content-catchup",
        viewportInteractionActive: false,
      },
      {
        expected: false,
        expectedResolutionDebtRequested: false,
        lane: "content",
        rawReasons: ["manual"],
        runtimeViewportFrame: false,
        reducerState: "content-catchup",
        viewportInteractionActive: false,
      },
      {
        expected: true,
        expectedResolutionDebtRequested: true,
        lane: "content",
        rawReasons: ["texture-upload", "manual"],
        runtimeViewportFrame: false,
        reducerState: "content-catchup",
        viewportInteractionActive: false,
      },
      {
        expected: true,
        expectedResolutionDebtRequested: true,
        lane: "content",
        rawReasons: ["retained-scroll", "texture-upload"],
        runtimeViewportFrame: false,
        reducerState: "motion-active",
        viewportInteractionActive: true,
      },
      {
        expected: false,
        expectedResolutionDebtRequested: false,
        lane: "content",
        rawReasons: ["texture-upload", "dom-control-activation"],
        runtimeViewportFrame: false,
        reducerState: "content-catchup",
        viewportInteractionActive: false,
      },
    ] as const;

    for (const testCase of cases) {
      const observed: Array<{
        readonly deferResolutionUpdates: boolean;
        readonly resolutionDebtRequested: boolean;
      }> = [];
      runGpuFlowVisibleFrameCoordinator({
        prepareContentPreparationFrame: ({ presentationFrameContext }) => {
          observed.push(
            observeResolutionDeferralContext(presentationFrameContext),
          );
          return testPresentationCandidate();
        },
        prepareMotionProjectionFrame: ({ presentationFrameContext }) => {
          observed.push(
            observeResolutionDeferralContext(presentationFrameContext),
          );
          return {
            frame: testPresentationCandidate(),
            kind: "not-rendered" as const,
          };
        },
        onPresentation: () => {},
        sampleVisibleFramePresentation: () =>
          visibleFramePresentationSample({
            rawReasons: testCase.rawReasons,
            runtimeViewportFrame: testCase.runtimeViewportFrame,
            sample: liveProjectionSample({ id: 57, timestamp: 570 }),
            viewportInteractionActive: testCase.viewportInteractionActive,
          }),
        reducerRuntime: fixedPresentationReducerRuntime({
          lane: testCase.lane,
          reducerState: testCase.reducerState,
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
      prepareContentPreparationFrame: ({ presentationFrameContext }) => {
        starvedObserved.push(presentationFrameContext.deferResolutionUpdates);
        return testPresentationCandidate();
      },
      prepareMotionProjectionFrame: ({ presentationFrameContext }) => {
        starvedObserved.push(presentationFrameContext.deferResolutionUpdates);
        return {
          frame: testPresentationCandidate(),
          kind: "not-rendered" as const,
        };
      },
      onPresentation: () => {},
      sampleVisibleFramePresentation: () =>
        visibleFramePresentationSample({
          rawReasons: ["manual"],
          runtimeViewportFrame: false,
          sample: liveProjectionSample({ id: 58, timestamp: 580 }),
          viewportInteractionActive: false,
        }),
      reducerRuntime: fixedPresentationReducerRuntime({
        lane: "content",
        reducerState: "motion-settling",
      }),
    });
    expect(starvedObserved).toEqual([true, true]);
  });

  it("starts budget-selected resource preparation before candidate preparation", () => {
    const phases: string[] = [];
    const observedActiveEditorPins: (readonly string[])[] = [];

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
      prepareContentPreparationFrame: ({ presentationFrameContext }) => {
        phases.push("content");
        observedActiveEditorPins.push(
          presentationFrameContext.activeEditorPins,
        );
        return testPresentationCandidate();
      },
      prepareMotionProjectionFrame: ({ presentationFrameContext }) => {
        phases.push("motion");
        observedActiveEditorPins.push(
          presentationFrameContext.activeEditorPins,
        );
        return {
          frame: testPresentationCandidate(),
          kind: "not-rendered" as const,
        };
      },
      prepareVisibleFrameResourcesForBudget: (budgetDecision) => {
        phases.push(
          `resources:${budgetDecision.preparationBudget.selectedDebtIds.join(",")}`,
        );
      },
      onPresentation: (transaction) => {
        phases.push(`onPresentation:${transaction.outcome.kind}`);
      },
      sampleVisibleFramePresentation: () =>
        visibleFramePresentationSample({
          sample: liveProjectionSample({ id: 59, timestamp: 590 }),
          visibleFrameResourceGraphSnapshot: {
            activeEditorPins: ["editor"],
            candidateResourceKeys: ["dom-control:editor"],
            presentedFrameId: null,
            presentedResourceKeys: [],
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
      reducerRuntime: fixedPresentationReducerRuntime({
        lane: "content",
        reducerState: "content-catchup",
      }),
    });

    expect(phases).toEqual([
      "resources:dom-control:editor",
      "motion",
      "content",
      "onPresentation:blocked",
    ]);
    expect(observedActiveEditorPins).toEqual([["editor"], ["editor"]]);
  });

  it("keeps selected visible resource debt on the scheduled lane while preparing resources before presentation", () => {
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
      prepareContentPreparationFrame: ({
        contentPreparationWorkPlan,
        presentationFrameContext,
      }) => {
        phases.push(
          `content:${contentPreparationWorkPlan.kind}:defer-${presentationFrameContext.deferResolutionUpdates}`,
        );
        return testPresentationCandidate();
      },
      prepareMotionProjectionFrame: ({
        motionProjectionWorkPlan,
        presentationFrameContext,
      }) => {
        phases.push(
          `motion:${motionProjectionWorkPlan.kind}:defer-${presentationFrameContext.deferResolutionUpdates}`,
        );
        return {
          frame: testPresentationCandidate(),
          kind: "not-rendered" as const,
        };
      },
      prepareVisibleFrameResourcesForBudget: (budgetDecision) => {
        phases.push(
          `resources:${budgetDecision.preparationBudget.selectedVisibleResourceDebtIds.join(",")}`,
        );
      },
      onPresentation: (transaction) => {
        phases.push(`onPresentation:${transaction.reducerDecision.lane}`);
      },
      sampleVisibleFramePresentation: () =>
        visibleFramePresentationSample({
          rawReasons: ["viewport"],
          runtimeViewportFrame: true,
          sample: liveProjectionSample({ id: 60, timestamp: 600 }),
          visibleFrameResourceGraphSnapshot: {
            activeEditorPins: ["editor"],
            candidateResourceKeys: ["dom-control:editor"],
            presentedFrameId: null,
            presentedResourceKeys: [],
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
      reducerRuntime: fixedPresentationReducerRuntime({
        lane: "motion",
        reducerState: "motion-active",
      }),
    });

    expect(result.reducerDecision.lane).toBe("motion");
    expect(result.reducerDecision.debt.motion).toBe(false);
    expect(
      result.presentationFrameContext.budgetDecision.preparationBudget,
    ).toMatchObject({
      selectedVisibleDebtIds: ["dom-control:editor"],
      selectedVisibleResourceDebtIds: ["dom-control:editor"],
    });
    expect(phases).toEqual([
      "resources:dom-control:editor",
      "motion:prepare:defer-true",
      "content:prepare:defer-true",
      "onPresentation:motion",
    ]);
  });
});

function observeResolutionDeferralContext(
  presentationFrameContext: GpuFlowVisibleFramePresentationFrameContext,
): {
  readonly deferResolutionUpdates: boolean;
  readonly resolutionDebtRequested: boolean;
} {
  const selectedDebtIds =
    presentationFrameContext.budgetDecision.preparationBudget.selectedDebtIds;
  const deferredDebtIds =
    presentationFrameContext.budgetDecision.preparationBudget.deferredDebtIds;
  return {
    deferResolutionUpdates: presentationFrameContext.deferResolutionUpdates,
    resolutionDebtRequested:
      selectedDebtIds.includes("resolution-update") ||
      deferredDebtIds.includes("resolution-update"),
  };
}

function fixedPresentationReducerRuntime({
  lane,
  reducerState,
}: {
  readonly lane: GpuFlowVisibleFrameReducerDecision["lane"];
  readonly reducerState: GpuFlowVisibleFrameReducerDecision["reducerState"];
}): ReturnType<typeof createGpuFlowVisibleFrameReducerRuntime> {
  const baseScheduler = createGpuFlowVisibleFrameReducerRuntime();
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
    recordUnpresentedFrame: (_decision, outcome) =>
      Object.freeze({
        debt,
        outcome: outcome.kind,
      }),
    selectFrameRequest: ({
      hasPresentedContentFrame,
      rawReasons,
      sample,
      timestamp,
      viewportInteractionActive,
    }) =>
      Object.freeze({
        contentDebt: lane === "content",
        contentRetryDeferred: false,
        criticalContentDebt: lane === "content",
        hasPresentedContentFrame,
        maintenanceDebt: lane === "maintenance",
        motionDebt: lane === "motion",
        motionRetryDeferred: false,
        rawReasons: Object.freeze([...rawReasons]),
        sample,
        reducerState,
        timestamp,
        viewportInteractionActive,
      }),
    selectFrame: ({ rawReasons, sample }): GpuFlowVisibleFrameReducerDecision =>
      Object.freeze({
        debt,
        lane,
        rawReasons: Object.freeze([...rawReasons]),
        sample,
        reducerState,
      }),
  };
}

function testPresentationCandidate(): {
  readonly blockedPresentationCandidate: null;
  readonly rendered: boolean;
  readonly visibleProjectionState: null;
} {
  return {
    blockedPresentationCandidate: null,
    rendered: false,
    visibleProjectionState: null,
  };
}

type VisibleFramePresentationSampleInput = Partial<
  Omit<GpuFlowVisibleFramePresentationSample, "sample">
> & { readonly sample: GpuFlowLiveProjectionSample };

function visibleFramePresentationSample({
  hasPresentedContentFrame = true,
  previousVisibleProjectionState = null,
  rawReasons = ["manual"],
  runtimeViewportFrame = false,
  sample,
  timestamp = sample.timestamp,
  visibleFrameResourceGraphSnapshot,
  viewportInteractionActive = false,
}: VisibleFramePresentationSampleInput): GpuFlowVisibleFramePresentationSample {
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
  } as GpuFlowLiveProjectionSample;
}

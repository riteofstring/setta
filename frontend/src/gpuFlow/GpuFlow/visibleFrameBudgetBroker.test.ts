import { describe, expect, it } from "vitest";

import type { GpuFlowVisiblePublicationDecision } from "../projectionRuntime";
import {
  createGpuFlowVisibleFrameBudgetBroker,
  createGpuFlowVisibleFrameBudgetDebtRequestsForResourceGraph,
  createGpuFlowVisibleFrameBudgetBrokerDecision,
  shouldDeferGpuFlowBrowserVisualRepairForBudget,
} from "./visibleFrameBudgetBroker";

describe("GPU Flow visible frame budget broker", () => {
  it("keeps browser visual repair eligible during motion-heavy frames", () => {
    const decision = createGpuFlowVisibleFrameBudgetBrokerDecision({
      deferResolutionUpdates: true,
      publicationDecision: publicationDecision({
        lane: "content",
        schedulerState: "motion-active",
      }),
    });

    expect(decision.browserVisualRepair).toEqual({
      debtAgeFrames: 0,
      eligible: true,
      priority: "safety",
    });
    expect(decision.preparationBudget.selectedDebtIds).toContain(
      "browser-visual-repair",
    );
    expect(decision.resolutionUpdates).toEqual({ deferred: true });
    expect(
      shouldDeferGpuFlowBrowserVisualRepairForBudget({
        deferResolutionUpdates: true,
        publicationDecision: publicationDecision({
          lane: "content",
          schedulerState: "motion-active",
        }),
      }),
    ).toBe(false);
  });

  it("arbitrates safety debt ahead of quality debt within a bounded preparation budget", () => {
    const budgetBroker = createGpuFlowVisibleFrameBudgetBroker({
      policy: {
        maxSafetyDebtAgeFrames: 1,
        maxContinuityDebtAgeFrames: 2,
        minPreparationBudgetDuringMotionMs: 1,
        perFramePreparationBudgetMs: 1,
        reservedMotionProjectionBudgetMs: 2,
      },
    });

    const decision = budgetBroker.selectFrameBudget({
      deferResolutionUpdates: false,
      publicationDecision: publicationDecision({
        lane: "content",
        schedulerState: "content-catchup",
      }),
      requestedDebt: [
        {
          estimatedCostMs: 1,
          id: "quality-refinement",
          priority: "quality",
        },
        {
          estimatedCostMs: 1,
          id: "browser-visual-repair",
          priority: "safety",
        },
      ],
    });

    expect(decision.preparationBudget).toMatchObject({
      availableMs: 1,
      deferredDebtIds: ["quality-refinement"],
      selectedDebtIds: ["browser-visual-repair"],
      usedMs: 1,
    });
    expect(decision.browserVisualRepair.eligible).toBe(true);
  });

  it("ages deferred debt so starvation is visible to the coordinator", () => {
    const budgetBroker = createGpuFlowVisibleFrameBudgetBroker({
      policy: {
        maxSafetyDebtAgeFrames: 1,
        maxContinuityDebtAgeFrames: 2,
        minPreparationBudgetDuringMotionMs: 1,
        perFramePreparationBudgetMs: 1,
        reservedMotionProjectionBudgetMs: 2,
      },
    });
    const frameDebt = [
      {
        estimatedCostMs: 1,
        id: "quality-refinement",
        priority: "quality" as const,
      },
      {
        estimatedCostMs: 1,
        id: "browser-visual-repair",
        priority: "safety" as const,
      },
    ];

    budgetBroker.selectFrameBudget({
      deferResolutionUpdates: false,
      publicationDecision: publicationDecision({
        lane: "content",
        schedulerState: "content-catchup",
      }),
      requestedDebt: frameDebt,
    });
    const secondDecision = budgetBroker.selectFrameBudget({
      deferResolutionUpdates: false,
      publicationDecision: publicationDecision({
        lane: "content",
        schedulerState: "content-catchup",
      }),
      requestedDebt: frameDebt,
    });

    expect(secondDecision.browserVisualRepair.debtAgeFrames).toBe(1);
    expect(secondDecision.preparationBudget.deferredDebtIds).toContain(
      "quality-refinement",
    );
  });

  it("brokers concrete resource graph debt by preparation lane and cost", () => {
    const budgetBroker = createGpuFlowVisibleFrameBudgetBroker({
      policy: {
        maxSafetyDebtAgeFrames: 1,
        maxContinuityDebtAgeFrames: 2,
        minPreparationBudgetDuringMotionMs: 2,
        perFramePreparationBudgetMs: 2,
        reservedMotionProjectionBudgetMs: 2,
      },
    });
    const requestedDebt = createGpuFlowVisibleFrameBudgetDebtRequestsForResourceGraph(
      {
        snapshot: {
          activeEditorPins: [],
          candidateResourceKeys: [],
          committedFrameId: null,
          committedResourceKeys: [],
          pendingCandidateFrameIds: [8],
          queuedResourceKeys: [
            "dom-control:active-editor",
            "page:quality-prefetch",
          ],
          resourceDebtByState: {
            absent: 0,
            preparing: 1,
            presented: 0,
            ready: 0,
            requested: 1,
            retired: 0,
          },
          resourceStates: [
            {
              debtAgeFrames: 2,
              deadlineFrame: 1,
              estimatedCostMs: 0.5,
              ownerFrameId: 8,
              preparationLane: "browser-visual",
              priority: "safety",
              resourceKey: "dom-control:active-editor",
              state: "requested",
            },
            {
              debtAgeFrames: 0,
              deadlineFrame: 8,
              estimatedCostMs: 2,
              ownerFrameId: 8,
              preparationLane: "retained-page",
              priority: "quality",
              resourceKey: "page:quality-prefetch",
              state: "preparing",
            },
          ],
        },
      },
    );

    const decision = budgetBroker.selectFrameBudget({
      deferResolutionUpdates: false,
      publicationDecision: publicationDecision({
        lane: "motion",
        schedulerState: "motion-active",
      }),
      requestedDebt,
    });

    expect(decision.preparationBudget.selectedDebtByLane).toEqual({
      "browser-visual": ["dom-control:active-editor"],
    });
    expect(decision.preparationBudget.deferredDebtByLane).toEqual({
      "retained-page": ["page:quality-prefetch"],
    });
    expect(decision.preparationBudget.overBudgetDebtIds).toEqual([
      "dom-control:active-editor",
    ]);
  });
});

function publicationDecision({
  lane,
  schedulerState,
}: {
  readonly lane: GpuFlowVisiblePublicationDecision["lane"];
  readonly schedulerState: GpuFlowVisiblePublicationDecision["schedulerState"];
}): Pick<
  GpuFlowVisiblePublicationDecision,
  "debt" | "lane" | "schedulerState"
> {
  return {
    debt: {
      content: lane === "content",
      maintenance: lane === "maintenance",
      motion: lane === "motion",
    },
    lane,
    schedulerState,
  };
}

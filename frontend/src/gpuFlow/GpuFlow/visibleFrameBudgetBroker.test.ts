import { describe, expect, it } from "vitest";

import type { GpuFlowVisiblePublicationDecision } from "../projectionRuntime";
import {
  createGpuFlowVisibleFrameBudgetBroker,
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
    expect(decision.resolutionUpdates).toEqual({ deferred: false });
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

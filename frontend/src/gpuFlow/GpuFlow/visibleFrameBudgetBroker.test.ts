import { describe, expect, it } from "vitest";

import type { GpuFlowVisibleFrameReducerDecision } from "../projectionRuntime";
import {
  createGpuFlowVisibleFrameBudgetBroker,
  createGpuFlowVisibleFrameBudgetBrokerDecision,
  createGpuFlowVisibleFrameBudgetDebtRequestsForResourceGraph,
  createGpuFlowVisibleFrameSelectedResourceWorkKeys,
  shouldDeferGpuFlowBrowserVisualRepairForBudget,
} from "./visibleFrameBudgetBroker";

describe("GPU Flow visible frame budget broker", () => {
  it("keeps browser visual repair eligible during motion-heavy frames", () => {
    const decision = createGpuFlowVisibleFrameBudgetBrokerDecision({
      deferResolutionUpdates: true,
      reducerDecision: reducerDecision({
        lane: "content",
        reducerState: "motion-active",
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
        reducerDecision: reducerDecision({
          lane: "content",
          reducerState: "motion-active",
        }),
      }),
    ).toBe(false);
  });

  it("does not synthesize browser visual repair debt for motion projection frames", () => {
    const decision = createGpuFlowVisibleFrameBudgetBrokerDecision({
      deferResolutionUpdates: false,
      reducerDecision: {
        debt: {
          content: true,
          maintenance: true,
          motion: true,
        },
        lane: "motion",
        reducerState: "motion-active",
      },
    });

    expect(decision.preparationBudget.selectedDebtIds).not.toContain(
      "browser-visual-repair",
    );
    expect(decision.preparationBudget.deferredDebtIds).not.toContain(
      "browser-visual-repair",
    );
    expect(decision.browserVisualRepair.eligible).toBe(false);
  });

  it("keeps continuity content repair budgeted during motion frames", () => {
    const decision = createGpuFlowVisibleFrameBudgetBrokerDecision({
      deferResolutionUpdates: true,
      reducerDecision: reducerDecision({
        classifiedDebt: classifiedDebt({
          continuity: { active: true, ageFrames: 1, ageMs: 16 },
        }),
        debt: {
          content: true,
          maintenance: false,
          motion: true,
        },
        lane: "motion",
        reducerState: "motion-active",
      }),
    });

    expect(decision.preparationBudget.selectedDebtByLane).toEqual({
      "retained-page": ["continuity-content-repair"],
    });
    expect(decision.preparationBudget.selectedDebtIds).toContain(
      "continuity-content-repair",
    );
    expect(decision.preparationBudget.selectedVisibleDebtIds).toEqual([
      "continuity-content-repair",
    ]);
    expect(decision.preparationBudget.deferredDebtIds).toContain(
      "resolution-update",
    );
  });

  it("uses concrete retained-page resource debt instead of synthetic continuity repair", () => {
    const decision = createGpuFlowVisibleFrameBudgetBrokerDecision({
      deferResolutionUpdates: false,
      reducerDecision: reducerDecision({
        classifiedDebt: classifiedDebt({
          continuity: { active: true, ageFrames: 1, ageMs: 16 },
        }),
        debt: {
          content: true,
          maintenance: false,
          motion: true,
        },
        lane: "motion",
        reducerState: "motion-active",
      }),
      resourceGraphSnapshot: {
        activeEditorPins: [],
        candidateResourceKeys: ["page:visible-section-page"],
        presentedFrameId: null,
        presentedResourceKeys: [],
        pendingCandidateFrameIds: [9],
        queuedResourceKeys: ["page:visible-section-page"],
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
            debtAgeFrames: 1,
            deadlineFrame: 2,
            estimatedCostMs: 1,
            ownerFrameId: 9,
            preparationLane: "retained-page",
            priority: "continuity",
            resourceKey: "page:visible-section-page",
            state: "requested",
          },
        ],
      },
    });

    expect(decision.preparationBudget.selectedDebtIds).toEqual([
      "page:visible-section-page",
    ]);
    expect(decision.preparationBudget.selectedDebtIds).not.toContain(
      "continuity-content-repair",
    );
    expect(decision.preparationBudget.selectedVisibleResourceDebtIds).toEqual([
      "page:visible-section-page",
    ]);
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
      reducerDecision: reducerDecision({
        lane: "content",
        reducerState: "content-catchup",
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
      reducerDecision: reducerDecision({
        lane: "content",
        reducerState: "content-catchup",
      }),
      requestedDebt: frameDebt,
    });
    const secondDecision = budgetBroker.selectFrameBudget({
      deferResolutionUpdates: false,
      reducerDecision: reducerDecision({
        lane: "content",
        reducerState: "content-catchup",
      }),
      requestedDebt: frameDebt,
    });

    expect(secondDecision.browserVisualRepair.debtAgeFrames).toBe(1);
    expect(secondDecision.preparationBudget.deferredDebtIds).toContain(
      "quality-refinement",
    );
  });

  it("fails loudly when over-budget visible debt remains deferred", () => {
    const budgetBroker = createGpuFlowVisibleFrameBudgetBroker({
      policy: {
        maxSafetyDebtAgeFrames: 1,
        maxContinuityDebtAgeFrames: 2,
        minPreparationBudgetDuringMotionMs: 0,
        perFramePreparationBudgetMs: 0,
        reservedMotionProjectionBudgetMs: 2,
      },
    });

    expect(() =>
      budgetBroker.selectFrameBudget({
        deferResolutionUpdates: false,
        reducerDecision: reducerDecision({
          lane: "motion",
          reducerState: "motion-active",
        }),
        requestedDebt: [
          {
            debtAgeFrames: 2,
            estimatedCostMs: 0.5,
            id: "dom-control:active-editor",
            preparationLane: "browser-visual",
            priority: "safety",
            resourceState: "requested",
            source: "resource-graph",
          },
        ],
      }),
    ).toThrow(
      /visible frame budget broker starved over-budget visible debt: dom-control:active-editor/,
    );
  });

  it("allows over-budget resource debt to progress in lane batches", () => {
    const budgetBroker = createGpuFlowVisibleFrameBudgetBroker({
      policy: {
        maxSafetyDebtAgeFrames: 0,
        maxContinuityDebtAgeFrames: 2,
        minPreparationBudgetDuringMotionMs: 1,
        perFramePreparationBudgetMs: 1,
        reservedMotionProjectionBudgetMs: 2,
      },
    });

    const decision = budgetBroker.selectFrameBudget({
      deferResolutionUpdates: false,
      reducerDecision: reducerDecision({
        lane: "content",
        reducerState: "content-catchup",
      }),
      requestedDebt: [
        {
          debtAgeFrames: 1,
          estimatedCostMs: 1,
          id: "dom-control:active-editor-a",
          preparationLane: "browser-visual",
          priority: "safety",
          resourceState: "requested",
          source: "resource-graph",
        },
        {
          debtAgeFrames: 1,
          estimatedCostMs: 1,
          id: "dom-control:active-editor-b",
          preparationLane: "browser-visual",
          priority: "safety",
          resourceState: "requested",
          source: "resource-graph",
        },
      ],
    });

    expect(decision.preparationBudget.selectedDebtIds).toEqual([
      "dom-control:active-editor-a",
    ]);
    expect(decision.preparationBudget.deferredDebtIds).toEqual([
      "dom-control:active-editor-b",
    ]);
    expect(decision.preparationBudget.overBudgetDebtIds).toEqual([
      "dom-control:active-editor-a",
      "dom-control:active-editor-b",
    ]);
  });

  it("does not treat synthetic browser visual repair as concrete starved debt", () => {
    const budgetBroker = createGpuFlowVisibleFrameBudgetBroker({
      policy: {
        maxSafetyDebtAgeFrames: 0,
        maxContinuityDebtAgeFrames: 2,
        minPreparationBudgetDuringMotionMs: 1,
        perFramePreparationBudgetMs: 1,
        reservedMotionProjectionBudgetMs: 2,
      },
    });

    const decision = budgetBroker.selectFrameBudget({
      deferResolutionUpdates: false,
      reducerDecision: reducerDecision({
        lane: "content",
        reducerState: "motion-active",
      }),
      requestedDebt: [
        {
          debtAgeFrames: 1,
          deadlineFrame: 0,
          estimatedCostMs: 1,
          id: "retained-page:critical",
          preparationLane: "retained-page",
          priority: "safety",
          resourceState: "requested",
          source: "resource-graph",
        },
        {
          debtAgeFrames: 1,
          estimatedCostMs: 1.5,
          id: "browser-visual-repair",
          preparationLane: "browser-visual",
          priority: "safety",
          resourceState: "requested",
          source: "synthetic",
        },
      ],
    });

    expect(decision.preparationBudget.selectedDebtIds).toEqual([
      "retained-page:critical",
    ]);
    expect(decision.preparationBudget.deferredDebtIds).toEqual([
      "browser-visual-repair",
    ]);
    expect(decision.preparationBudget.overBudgetDebtIds).toEqual([
      "retained-page:critical",
      "browser-visual-repair",
    ]);
    expect(decision.browserVisualRepair.eligible).toBe(false);
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
    const requestedDebt =
      createGpuFlowVisibleFrameBudgetDebtRequestsForResourceGraph({
        snapshot: {
          activeEditorPins: [],
          candidateResourceKeys: [],
          presentedFrameId: null,
          presentedResourceKeys: [],
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
      });

    const decision = budgetBroker.selectFrameBudget({
      deferResolutionUpdates: false,
      reducerDecision: reducerDecision({
        lane: "motion",
        reducerState: "motion-active",
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

  it("includes resource graph debt in frame-context budget decisions", () => {
    const decision = createGpuFlowVisibleFrameBudgetBrokerDecision({
      deferResolutionUpdates: false,
      reducerDecision: reducerDecision({
        lane: "motion",
        reducerState: "motion-active",
      }),
      resourceGraphSnapshot: {
        activeEditorPins: [],
        candidateResourceKeys: [],
        presentedFrameId: null,
        presentedResourceKeys: [],
        pendingCandidateFrameIds: [9],
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
            debtAgeFrames: 0,
            deadlineFrame: 1,
            estimatedCostMs: 0.5,
            ownerFrameId: 9,
            preparationLane: "browser-visual",
            priority: "safety",
            resourceKey: "dom-control:active-editor",
            state: "requested",
          },
          {
            debtAgeFrames: 0,
            deadlineFrame: 9,
            estimatedCostMs: 2,
            ownerFrameId: 9,
            preparationLane: "retained-page",
            priority: "quality",
            resourceKey: "page:quality-prefetch",
            state: "preparing",
          },
        ],
      },
    });

    expect(decision.preparationBudget.selectedDebtByLane).toEqual({
      "browser-visual": ["dom-control:active-editor"],
    });
    expect(decision.preparationBudget.deferredDebtByLane).toEqual({
      "retained-page": ["page:quality-prefetch"],
    });
  });

  it("ignores orphaned preparing resource debt until a candidate or queue references it", () => {
    const requestedDebt =
      createGpuFlowVisibleFrameBudgetDebtRequestsForResourceGraph({
        snapshot: {
          activeEditorPins: [],
          candidateResourceKeys: [],
          presentedFrameId: null,
          presentedResourceKeys: [],
          pendingCandidateFrameIds: [],
          queuedResourceKeys: ["dom-control-snapshot:current-editor"],
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
              debtAgeFrames: 132,
              deadlineFrame: 1,
              estimatedCostMs: 1.5,
              ownerFrameId: 3,
              preparationLane: "browser-visual",
              priority: "safety",
              resourceKey: "dom-control-snapshot:orphaned-editor",
              state: "preparing",
            },
            {
              debtAgeFrames: 0,
              deadlineFrame: 8,
              estimatedCostMs: 1.5,
              ownerFrameId: 42,
              preparationLane: "browser-visual",
              priority: "safety",
              resourceKey: "dom-control-snapshot:current-editor",
              state: "requested",
            },
          ],
        },
      });

    expect(requestedDebt.map((debt) => debt.id)).toEqual([
      "dom-control-snapshot:current-editor",
    ]);
  });

  it("keeps in-flight preparing resource work visible to the budget broker", () => {
    const requestedDebt =
      createGpuFlowVisibleFrameBudgetDebtRequestsForResourceGraph({
        snapshot: {
          activeEditorPins: [],
          candidateResourceKeys: ["dom-control:preparing-editor"],
          presentedFrameId: null,
          presentedResourceKeys: [],
          pendingCandidateFrameIds: [43],
          queuedResourceKeys: ["dom-control:preparing-editor"],
          resourceDebtByState: {
            absent: 0,
            preparing: 1,
            presented: 0,
            ready: 0,
            requested: 0,
            retired: 0,
          },
          resourceStates: [
            {
              debtAgeFrames: 132,
              deadlineFrame: 1,
              estimatedCostMs: 0.5,
              ownerFrameId: 43,
              preparationLane: "browser-visual",
              priority: "safety",
              resourceKey: "dom-control:preparing-editor",
              state: "preparing",
            },
          ],
        },
      });

    expect(requestedDebt).toEqual([
      {
        debtAgeFrames: 132,
        deadlineFrame: 1,
        estimatedCostMs: 0.5,
        id: "dom-control:preparing-editor",
        ownerFrameId: 43,
        preparationLane: "browser-visual",
        priority: "safety",
        resourceState: "preparing",
        source: "resource-graph",
      },
    ]);
  });

  it("ignores stale pending candidate debt when newer candidate debt is present", () => {
    const requestedDebt =
      createGpuFlowVisibleFrameBudgetDebtRequestsForResourceGraph({
        snapshot: {
          activeEditorPins: [],
          candidateResourceKeys: [
            "dom-control:stale-editor",
            "dom-control:current-editor",
          ],
          presentedFrameId: 5,
          presentedResourceKeys: [],
          pendingCandidateFrameIds: [8, 9],
          queuedResourceKeys: [
            "dom-control:stale-editor",
            "dom-control:current-editor",
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
              debtAgeFrames: 120,
              deadlineFrame: 1,
              estimatedCostMs: 0.5,
              ownerFrameId: 8,
              preparationLane: "browser-visual",
              priority: "safety",
              resourceKey: "dom-control:stale-editor",
              state: "preparing",
            },
            {
              debtAgeFrames: 0,
              deadlineFrame: 2,
              estimatedCostMs: 0.5,
              ownerFrameId: 9,
              preparationLane: "browser-visual",
              priority: "safety",
              resourceKey: "dom-control:current-editor",
              state: "requested",
            },
          ],
        },
      });

    expect(requestedDebt.map((debt) => debt.id)).toEqual([
      "dom-control:current-editor",
    ]);
  });

  it("maps selected synthetic browser-visual repair to newly queued resource work", () => {
    const decision = createGpuFlowVisibleFrameBudgetBrokerDecision({
      deferResolutionUpdates: false,
      reducerDecision: reducerDecision({
        lane: "content",
        reducerState: "content-catchup",
      }),
    });

    expect(decision.preparationBudget.selectedDebtIds).toContain(
      "browser-visual-repair",
    );
    expect(decision.preparationBudget.selectedResourceDebtIds).toEqual([]);
    expect(
      createGpuFlowVisibleFrameSelectedResourceWorkKeys({
        budgetDecision: decision,
        resourceGraphSnapshot: {
          activeEditorPins: [],
          candidateResourceKeys: ["dom-control-snapshot:retained-text-control"],
          presentedFrameId: null,
          presentedResourceKeys: [],
          pendingCandidateFrameIds: [10],
          queuedResourceKeys: ["dom-control-snapshot:retained-text-control"],
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
              deadlineFrame: 2,
              estimatedCostMs: 1.5,
              ownerFrameId: 10,
              preparationLane: "browser-visual",
              priority: "safety",
              resourceKey: "dom-control-snapshot:retained-text-control",
              state: "requested",
            },
          ],
        },
      }),
    ).toEqual(["dom-control-snapshot:retained-text-control"]);
  });

  it("uses concrete browser-visual resource debt instead of synthetic repair placeholders", () => {
    const decision = createGpuFlowVisibleFrameBudgetBrokerDecision({
      deferResolutionUpdates: false,
      reducerDecision: reducerDecision({
        lane: "content",
        reducerState: "content-catchup",
      }),
      resourceGraphSnapshot: {
        activeEditorPins: ["active-editor"],
        candidateResourceKeys: ["dom-control:active-editor"],
        presentedFrameId: null,
        presentedResourceKeys: [],
        pendingCandidateFrameIds: [10],
        queuedResourceKeys: ["dom-control:active-editor"],
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
            debtAgeFrames: 1,
            deadlineFrame: 2,
            estimatedCostMs: 0.5,
            ownerFrameId: 10,
            preparationLane: "browser-visual",
            priority: "safety",
            resourceKey: "dom-control:active-editor",
            state: "requested",
          },
        ],
      },
    });

    expect(decision.browserVisualRepair).toEqual({
      debtAgeFrames: 1,
      eligible: true,
      priority: "safety",
    });
    expect(decision.preparationBudget.selectedDebtIds).toContain(
      "dom-control:active-editor",
    );
    expect(decision.preparationBudget.selectedDebtIds).not.toContain(
      "browser-visual-repair",
    );
    expect(decision.preparationBudget.selectedResourceDebtIds).toEqual([
      "dom-control:active-editor",
    ]);
    expect(decision.preparationBudget.selectedVisibleDebtIds).toEqual([
      "dom-control:active-editor",
    ]);
    expect(decision.preparationBudget.selectedVisibleResourceDebtIds).toEqual([
      "dom-control:active-editor",
    ]);
  });
});

function reducerDecision({
  classifiedDebt,
  debt,
  lane,
  reducerState,
}: {
  readonly classifiedDebt?:
    | GpuFlowVisibleFrameReducerDecision["classifiedDebt"]
    | undefined;
  readonly debt?:
    | Partial<GpuFlowVisibleFrameReducerDecision["debt"]>
    | undefined;
  readonly lane: GpuFlowVisibleFrameReducerDecision["lane"];
  readonly reducerState: GpuFlowVisibleFrameReducerDecision["reducerState"];
}): Pick<
  GpuFlowVisibleFrameReducerDecision,
  "classifiedDebt" | "debt" | "lane" | "reducerState"
> {
  return {
    classifiedDebt,
    debt: {
      content: lane === "content",
      maintenance: lane === "maintenance",
      motion: lane === "motion",
      ...debt,
    },
    lane,
    reducerState,
  };
}

function classifiedDebt(
  overrides: Partial<
    NonNullable<GpuFlowVisibleFrameReducerDecision["classifiedDebt"]>
  >,
): NonNullable<GpuFlowVisibleFrameReducerDecision["classifiedDebt"]> {
  return {
    continuity: { active: false, ageFrames: 0, ageMs: 0 },
    quality: { active: false, ageFrames: 0, ageMs: 0 },
    safety: { active: false, ageFrames: 0, ageMs: 0 },
    ...overrides,
  };
}

import type { GpuFlowVisiblePublicationDecision } from "../projectionRuntime";

type GpuFlowVisibleFrameBudgetPriority = "continuity" | "quality" | "safety";

type GpuFlowVisibleFrameBudgetDebtRequest = {
  readonly estimatedCostMs: number;
  readonly id: string;
  readonly priority: GpuFlowVisibleFrameBudgetPriority;
};

type GpuFlowVisibleFrameBudgetBrokerPolicy = {
  readonly maxContinuityDebtAgeFrames: number;
  readonly minPreparationBudgetDuringMotionMs: number;
  readonly perFramePreparationBudgetMs: number;
  readonly reservedMotionProjectionBudgetMs: number;
};

type GpuFlowVisibleFrameBudgetBrokerDecision = {
  readonly browserVisualRepair: {
    readonly debtAgeFrames: number;
    readonly eligible: boolean;
    readonly priority: GpuFlowVisibleFrameBudgetPriority;
  };
  readonly preparationBudget: {
    readonly availableMs: number;
    readonly deferredDebtIds: readonly string[];
    readonly reservedMotionProjectionMs: number;
    readonly selectedDebtIds: readonly string[];
    readonly usedMs: number;
  };
  readonly resolutionUpdates: {
    readonly deferred: boolean;
  };
};

export type GpuFlowVisibleFrameBudgetBroker = {
  readonly selectFrameBudget: (input: {
    readonly deferResolutionUpdates: boolean;
    readonly publicationDecision: Pick<
      GpuFlowVisiblePublicationDecision,
      "debt" | "lane" | "schedulerState"
    >;
    readonly requestedDebt?: readonly GpuFlowVisibleFrameBudgetDebtRequest[];
  }) => GpuFlowVisibleFrameBudgetBrokerDecision;
};

export const DEFAULT_GPU_FLOW_VISIBLE_FRAME_BUDGET_BROKER_POLICY: GpuFlowVisibleFrameBudgetBrokerPolicy =
  Object.freeze({
    maxContinuityDebtAgeFrames: 2,
    minPreparationBudgetDuringMotionMs: 2,
    perFramePreparationBudgetMs: 4,
    reservedMotionProjectionBudgetMs: 2,
  });

export function createGpuFlowVisibleFrameBudgetBroker({
  policy = DEFAULT_GPU_FLOW_VISIBLE_FRAME_BUDGET_BROKER_POLICY,
}: {
  readonly policy?: GpuFlowVisibleFrameBudgetBrokerPolicy | undefined;
} = {}): GpuFlowVisibleFrameBudgetBroker {
  assertGpuFlowVisibleFrameBudgetBrokerPolicy(policy);
  const normalizedPolicy = Object.freeze({ ...policy });
  const debtAgeById = new Map<string, number>();
  return Object.freeze({
    selectFrameBudget({
      deferResolutionUpdates,
      publicationDecision,
      requestedDebt = createGpuFlowVisibleFrameBudgetDebtRequests({
        deferResolutionUpdates,
        publicationDecision,
      }),
    }) {
      const agedDebt = ageGpuFlowVisibleFrameBudgetDebt({
        debtAgeById,
        requestedDebt,
      });
      const availableMs =
        publicationDecision.schedulerState === "motion-active" ||
        publicationDecision.lane === "motion"
          ? normalizedPolicy.minPreparationBudgetDuringMotionMs
          : normalizedPolicy.perFramePreparationBudgetMs;
      const selected = selectGpuFlowVisibleFrameBudgetDebt({
        availableMs,
        maxContinuityDebtAgeFrames: normalizedPolicy.maxContinuityDebtAgeFrames,
        requestedDebt: agedDebt,
      });
      const selectedDebtIds = selected.selectedDebt.map((debt) => debt.id);
      const deferredDebtIds = selected.deferredDebt.map((debt) => debt.id);
      const browserVisualDebt = agedDebt.find(
        (debt) => debt.id === "browser-visual-repair",
      );
      const resolutionDebtSelected =
        selectedDebtIds.includes("resolution-update");
      return Object.freeze({
        browserVisualRepair: Object.freeze({
          debtAgeFrames: browserVisualDebt?.debtAgeFrames ?? 0,
          eligible: selectedDebtIds.includes("browser-visual-repair"),
          priority: browserVisualDebt?.priority ?? "safety",
        }),
        preparationBudget: Object.freeze({
          availableMs,
          deferredDebtIds: Object.freeze(deferredDebtIds),
          reservedMotionProjectionMs:
            normalizedPolicy.reservedMotionProjectionBudgetMs,
          selectedDebtIds: Object.freeze(selectedDebtIds),
          usedMs: selected.usedMs,
        }),
        resolutionUpdates: Object.freeze({
          deferred: deferResolutionUpdates && !resolutionDebtSelected,
        }),
      });
    },
  });
}

export function createGpuFlowVisibleFrameBudgetBrokerDecision({
  budgetBroker = createGpuFlowVisibleFrameBudgetBroker(),
  deferResolutionUpdates,
  publicationDecision,
}: {
  readonly budgetBroker?: GpuFlowVisibleFrameBudgetBroker | undefined;
  readonly deferResolutionUpdates: boolean;
  readonly publicationDecision: Pick<
    GpuFlowVisiblePublicationDecision,
    "debt" | "lane" | "schedulerState"
  >;
}): GpuFlowVisibleFrameBudgetBrokerDecision {
  return budgetBroker.selectFrameBudget({
    deferResolutionUpdates,
    publicationDecision,
  });
}

export function shouldDeferGpuFlowBrowserVisualRepairForBudget(
  input: Parameters<typeof createGpuFlowVisibleFrameBudgetBrokerDecision>[0],
): boolean {
  return !createGpuFlowVisibleFrameBudgetBrokerDecision(input)
    .browserVisualRepair.eligible;
}

type GpuFlowVisibleFrameAgedBudgetDebtRequest =
  GpuFlowVisibleFrameBudgetDebtRequest & {
    readonly debtAgeFrames: number;
  };

function createGpuFlowVisibleFrameBudgetDebtRequests({
  deferResolutionUpdates,
  publicationDecision,
}: {
  readonly deferResolutionUpdates: boolean;
  readonly publicationDecision: Pick<
    GpuFlowVisiblePublicationDecision,
    "debt" | "lane" | "schedulerState"
  >;
}): readonly GpuFlowVisibleFrameBudgetDebtRequest[] {
  const debt: GpuFlowVisibleFrameBudgetDebtRequest[] = [];
  if (
    publicationDecision.debt.content ||
    publicationDecision.lane === "content"
  ) {
    debt.push({
      estimatedCostMs: 1,
      id: "browser-visual-repair",
      priority: "safety",
    });
  }
  if (publicationDecision.debt.maintenance) {
    debt.push({
      estimatedCostMs: 1,
      id: "maintenance-refinement",
      priority: "quality",
    });
  }
  if (deferResolutionUpdates) {
    debt.push({
      estimatedCostMs: 1,
      id: "resolution-update",
      priority: "quality",
    });
  }
  return Object.freeze(debt);
}

function ageGpuFlowVisibleFrameBudgetDebt({
  debtAgeById,
  requestedDebt,
}: {
  readonly debtAgeById: Map<string, number>;
  readonly requestedDebt: readonly GpuFlowVisibleFrameBudgetDebtRequest[];
}): readonly GpuFlowVisibleFrameAgedBudgetDebtRequest[] {
  const activeDebtIds = new Set(requestedDebt.map((debt) => debt.id));
  for (const debtId of debtAgeById.keys()) {
    if (!activeDebtIds.has(debtId)) {
      debtAgeById.delete(debtId);
    }
  }
  return Object.freeze(
    requestedDebt.map((debt) => {
      const debtAgeFrames = (debtAgeById.get(debt.id) ?? -1) + 1;
      debtAgeById.set(debt.id, debtAgeFrames);
      return Object.freeze({
        ...debt,
        debtAgeFrames,
      });
    }),
  );
}

function selectGpuFlowVisibleFrameBudgetDebt({
  availableMs,
  maxContinuityDebtAgeFrames,
  requestedDebt,
}: {
  readonly availableMs: number;
  readonly maxContinuityDebtAgeFrames: number;
  readonly requestedDebt: readonly GpuFlowVisibleFrameAgedBudgetDebtRequest[];
}): {
  readonly deferredDebt: readonly GpuFlowVisibleFrameAgedBudgetDebtRequest[];
  readonly selectedDebt: readonly GpuFlowVisibleFrameAgedBudgetDebtRequest[];
  readonly usedMs: number;
} {
  const sortedDebt = [...requestedDebt].sort((left, right) =>
    compareGpuFlowVisibleFrameBudgetDebt({
      left,
      maxContinuityDebtAgeFrames,
      right,
    }),
  );
  const selectedDebt: GpuFlowVisibleFrameAgedBudgetDebtRequest[] = [];
  const deferredDebt: GpuFlowVisibleFrameAgedBudgetDebtRequest[] = [];
  let usedMs = 0;
  for (const debt of sortedDebt) {
    if (usedMs + debt.estimatedCostMs <= availableMs) {
      selectedDebt.push(debt);
      usedMs += debt.estimatedCostMs;
    } else {
      deferredDebt.push(debt);
    }
  }
  return Object.freeze({
    deferredDebt: Object.freeze(deferredDebt),
    selectedDebt: Object.freeze(selectedDebt),
    usedMs,
  });
}

function compareGpuFlowVisibleFrameBudgetDebt({
  left,
  maxContinuityDebtAgeFrames,
  right,
}: {
  readonly left: GpuFlowVisibleFrameAgedBudgetDebtRequest;
  readonly maxContinuityDebtAgeFrames: number;
  readonly right: GpuFlowVisibleFrameAgedBudgetDebtRequest;
}): number {
  return (
    getGpuFlowVisibleFrameBudgetDebtRank({
      debt: left,
      maxContinuityDebtAgeFrames,
    }) -
      getGpuFlowVisibleFrameBudgetDebtRank({
        debt: right,
        maxContinuityDebtAgeFrames,
      }) ||
    right.debtAgeFrames - left.debtAgeFrames ||
    left.id.localeCompare(right.id)
  );
}

function getGpuFlowVisibleFrameBudgetDebtRank({
  debt,
  maxContinuityDebtAgeFrames,
}: {
  readonly debt: GpuFlowVisibleFrameAgedBudgetDebtRequest;
  readonly maxContinuityDebtAgeFrames: number;
}): number {
  if (debt.priority === "safety") {
    return 0;
  }
  if (
    debt.priority === "continuity" ||
    debt.debtAgeFrames >= maxContinuityDebtAgeFrames
  ) {
    return 1;
  }
  return 2;
}

function assertGpuFlowVisibleFrameBudgetBrokerPolicy(
  policy: GpuFlowVisibleFrameBudgetBrokerPolicy,
): void {
  for (const [name, value] of Object.entries(policy)) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(
        `GPU Flow visible frame budget broker policy ${name} must be finite and non-negative.`,
      );
    }
  }
}

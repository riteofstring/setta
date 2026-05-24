import type {
  GpuFlowVisibleFrameResourceGraphSnapshot,
  GpuFlowVisibleFrameResourcePreparationLane,
  GpuFlowVisibleFrameResourcePriority,
  GpuFlowVisibleFrameResourceStateKind,
  GpuFlowVisibleFrameResourceStateSnapshot,
} from "./visibleFrameResourceGraph";
import type { GpuFlowVisiblePublicationDecision } from "./visibleFrameScheduling";

export type GpuFlowVisibleFrameBudgetPriority =
  GpuFlowVisibleFrameResourcePriority;

export type GpuFlowVisibleFrameBudgetDebtRequest = {
  readonly debtAgeFrames?: number | undefined;
  readonly deadlineFrame?: number | null | undefined;
  readonly estimatedCostMs: number;
  readonly id: string;
  readonly ownerFrameId?: number | null | undefined;
  readonly preparationLane?:
    | GpuFlowVisibleFrameResourcePreparationLane
    | undefined;
  readonly priority: GpuFlowVisibleFrameBudgetPriority;
  readonly resourceState?: GpuFlowVisibleFrameResourceStateKind | undefined;
  readonly source?: "resource-graph" | "synthetic" | undefined;
};

export type GpuFlowVisibleFrameBudgetBrokerPolicy = {
  readonly maxSafetyDebtAgeFrames: number;
  readonly maxContinuityDebtAgeFrames: number;
  readonly minPreparationBudgetDuringMotionMs: number;
  readonly perFramePreparationBudgetMs: number;
  readonly reservedMotionProjectionBudgetMs: number;
};

export type GpuFlowVisibleFrameBudgetBrokerDecision = {
  readonly browserVisualRepair: {
    readonly debtAgeFrames: number;
    readonly eligible: boolean;
    readonly priority: GpuFlowVisibleFrameBudgetPriority;
  };
  readonly preparationBudget: {
    readonly availableMs: number;
    readonly deferredDebtIds: readonly string[];
    readonly deferredDebtByLane: Partial<
      Record<GpuFlowVisibleFrameResourcePreparationLane, readonly string[]>
    >;
    readonly overBudgetDebtIds: readonly string[];
    readonly reservedMotionProjectionMs: number;
    readonly selectedDebtByLane: Partial<
      Record<GpuFlowVisibleFrameResourcePreparationLane, readonly string[]>
    >;
    readonly selectedDebtIds: readonly string[];
    readonly selectedVisibleDebtIds: readonly string[];
    readonly selectedResourceDebtIds: readonly string[];
    readonly selectedVisibleResourceDebtIds: readonly string[];
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
    maxSafetyDebtAgeFrames: 1,
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
        maxSafetyDebtAgeFrames: normalizedPolicy.maxSafetyDebtAgeFrames,
        requestedDebt: agedDebt,
      });
      const selectedDebtIds = selected.selectedDebt.map((debt) => debt.id);
      const deferredDebtIds = selected.deferredDebt.map((debt) => debt.id);
      const selectedResourceDebtIds = selected.selectedDebt
        .filter(isGpuFlowVisibleFrameResourceGraphBudgetDebt)
        .map((debt) => debt.id);
      const selectedVisibleDebtIds = selected.selectedDebt
        .filter(isGpuFlowVisibleFrameSafetyOrContinuityDebt)
        .map((debt) => debt.id);
      const selectedVisibleResourceDebtIds = selected.selectedDebt
        .filter(isGpuFlowVisibleFrameSafetyOrContinuityDebt)
        .filter(isGpuFlowVisibleFrameResourceGraphBudgetDebt)
        .map((debt) => debt.id);
      const overBudgetDebtIds = selectGpuFlowVisibleFrameOverBudgetDebtIds({
        maxContinuityDebtAgeFrames: normalizedPolicy.maxContinuityDebtAgeFrames,
        maxSafetyDebtAgeFrames: normalizedPolicy.maxSafetyDebtAgeFrames,
        requestedDebt: agedDebt,
      });
      assertGpuFlowVisibleFrameBudgetDebtNotStarved({
        overBudgetDebtIds,
        selectedDebtIds,
      });
      const browserVisualDebt =
        selectGpuFlowVisibleFrameBrowserVisualDebt(agedDebt);
      const resolutionDebtSelected =
        selectedDebtIds.includes("resolution-update");
      return Object.freeze({
        browserVisualRepair: Object.freeze({
          debtAgeFrames: browserVisualDebt?.debtAgeFrames ?? 0,
          eligible: selected.selectedDebt.some(
            isGpuFlowVisibleFrameBrowserVisualRepairDebt,
          ),
          priority: browserVisualDebt?.priority ?? "safety",
        }),
        preparationBudget: Object.freeze({
          availableMs,
          deferredDebtIds: Object.freeze(deferredDebtIds),
          deferredDebtByLane: createGpuFlowVisibleFrameBudgetDebtIdsByLane(
            selected.deferredDebt,
          ),
          overBudgetDebtIds: Object.freeze(overBudgetDebtIds),
          reservedMotionProjectionMs:
            normalizedPolicy.reservedMotionProjectionBudgetMs,
          selectedDebtByLane: createGpuFlowVisibleFrameBudgetDebtIdsByLane(
            selected.selectedDebt,
          ),
          selectedDebtIds: Object.freeze(selectedDebtIds),
          selectedVisibleDebtIds: Object.freeze(selectedVisibleDebtIds),
          selectedResourceDebtIds: Object.freeze(selectedResourceDebtIds),
          selectedVisibleResourceDebtIds: Object.freeze(
            selectedVisibleResourceDebtIds,
          ),
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
  resourceGraphSnapshot = null,
}: {
  readonly budgetBroker?: GpuFlowVisibleFrameBudgetBroker | undefined;
  readonly deferResolutionUpdates: boolean;
  readonly publicationDecision: Pick<
    GpuFlowVisiblePublicationDecision,
    "debt" | "lane" | "schedulerState"
  >;
  readonly resourceGraphSnapshot?:
    | GpuFlowVisibleFrameResourceGraphSnapshot
    | null
    | undefined;
}): GpuFlowVisibleFrameBudgetBrokerDecision {
  return budgetBroker.selectFrameBudget({
    deferResolutionUpdates,
    publicationDecision,
    requestedDebt: createGpuFlowVisibleFrameBudgetDebtRequests({
      deferResolutionUpdates,
      publicationDecision,
      resourceGraphSnapshot,
    }),
  });
}

export function shouldDeferGpuFlowBrowserVisualRepairForBudget(
  input: Parameters<typeof createGpuFlowVisibleFrameBudgetBrokerDecision>[0],
): boolean {
  return !createGpuFlowVisibleFrameBudgetBrokerDecision(input)
    .browserVisualRepair.eligible;
}

export function createGpuFlowVisibleFrameSelectedResourceWorkKeys({
  budgetDecision,
  resourceGraphSnapshot,
}: {
  readonly budgetDecision: GpuFlowVisibleFrameBudgetBrokerDecision;
  readonly resourceGraphSnapshot: GpuFlowVisibleFrameResourceGraphSnapshot;
}): readonly string[] {
  const selectedResourceDebtIds = [
    ...budgetDecision.preparationBudget.selectedResourceDebtIds,
  ];
  if (
    !budgetDecision.preparationBudget.selectedDebtIds.includes(
      "browser-visual-repair",
    )
  ) {
    return Object.freeze(selectedResourceDebtIds);
  }
  const resourceStateByKey = new Map(
    resourceGraphSnapshot.resourceStates.map((state) => [
      state.resourceKey,
      state,
    ]),
  );
  if (
    selectedResourceDebtIds.some(
      (resourceKey) =>
        resourceStateByKey.get(resourceKey)?.preparationLane ===
        "browser-visual",
    )
  ) {
    return Object.freeze(selectedResourceDebtIds);
  }
  const selectedResourceDebtIdSet = new Set(selectedResourceDebtIds);
  const selectedBrowserVisualResourceKey =
    resourceGraphSnapshot.queuedResourceKeys.find((resourceKey) => {
      const state = resourceStateByKey.get(resourceKey);
      return (
        state?.preparationLane === "browser-visual" &&
        !selectedResourceDebtIdSet.has(resourceKey)
      );
    });
  if (!selectedBrowserVisualResourceKey) {
    return Object.freeze(selectedResourceDebtIds);
  }
  return Object.freeze([
    ...selectedResourceDebtIds,
    selectedBrowserVisualResourceKey,
  ]);
}

type GpuFlowVisibleFrameAgedBudgetDebtRequest =
  GpuFlowVisibleFrameBudgetDebtRequest & {
    readonly debtAgeFrames: number;
  };

function createGpuFlowVisibleFrameBudgetDebtRequests({
  deferResolutionUpdates,
  publicationDecision,
  resourceGraphSnapshot = null,
}: {
  readonly deferResolutionUpdates: boolean;
  readonly publicationDecision: Pick<
    GpuFlowVisiblePublicationDecision,
    "debt" | "lane" | "schedulerState"
  >;
  readonly resourceGraphSnapshot?:
    | GpuFlowVisibleFrameResourceGraphSnapshot
    | null
    | undefined;
}): readonly GpuFlowVisibleFrameBudgetDebtRequest[] {
  const debt: GpuFlowVisibleFrameBudgetDebtRequest[] = [];
  const resourceGraphDebt =
    resourceGraphSnapshot === null
      ? []
      : createGpuFlowVisibleFrameBudgetDebtRequestsForResourceGraph({
          snapshot: resourceGraphSnapshot,
        });
  if (
    (publicationDecision.debt.content ||
      publicationDecision.lane === "content") &&
    !resourceGraphDebt.some(isGpuFlowVisibleFrameBrowserVisualRepairDebt)
  ) {
    debt.push({
      estimatedCostMs: 1.5,
      id: "browser-visual-repair",
      preparationLane: "browser-visual",
      priority: "safety",
      resourceState: "requested",
      source: "synthetic",
    });
  }
  if (publicationDecision.debt.maintenance) {
    debt.push({
      estimatedCostMs: 2,
      id: "maintenance-refinement",
      preparationLane: "maintenance-refinement",
      priority: "quality",
      resourceState: "requested",
      source: "synthetic",
    });
  }
  if (deferResolutionUpdates) {
    debt.push({
      estimatedCostMs: 1.25,
      id: "resolution-update",
      preparationLane: "retained-page",
      priority: "quality",
      resourceState: "requested",
      source: "synthetic",
    });
  }
  debt.push(...resourceGraphDebt);
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
      const debtAgeFrames = Math.max(
        debt.debtAgeFrames ?? 0,
        (debtAgeById.get(debt.id) ?? -1) + 1,
      );
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
  maxSafetyDebtAgeFrames,
  requestedDebt,
}: {
  readonly availableMs: number;
  readonly maxContinuityDebtAgeFrames: number;
  readonly maxSafetyDebtAgeFrames: number;
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
      maxSafetyDebtAgeFrames,
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
  maxSafetyDebtAgeFrames,
  right,
}: {
  readonly left: GpuFlowVisibleFrameAgedBudgetDebtRequest;
  readonly maxContinuityDebtAgeFrames: number;
  readonly maxSafetyDebtAgeFrames: number;
  readonly right: GpuFlowVisibleFrameAgedBudgetDebtRequest;
}): number {
  return (
    getGpuFlowVisibleFrameBudgetDebtRank({
      debt: left,
      maxContinuityDebtAgeFrames,
      maxSafetyDebtAgeFrames,
    }) -
      getGpuFlowVisibleFrameBudgetDebtRank({
        debt: right,
        maxContinuityDebtAgeFrames,
        maxSafetyDebtAgeFrames,
      }) ||
    compareGpuFlowVisibleFrameBudgetDebtDeadline(left, right) ||
    right.debtAgeFrames - left.debtAgeFrames ||
    left.id.localeCompare(right.id)
  );
}

function getGpuFlowVisibleFrameBudgetDebtRank({
  debt,
  maxContinuityDebtAgeFrames,
  maxSafetyDebtAgeFrames,
}: {
  readonly debt: GpuFlowVisibleFrameAgedBudgetDebtRequest;
  readonly maxContinuityDebtAgeFrames: number;
  readonly maxSafetyDebtAgeFrames: number;
}): number {
  if (
    debt.priority === "safety" ||
    debt.debtAgeFrames >= maxSafetyDebtAgeFrames
  ) {
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

function compareGpuFlowVisibleFrameBudgetDebtDeadline(
  left: GpuFlowVisibleFrameAgedBudgetDebtRequest,
  right: GpuFlowVisibleFrameAgedBudgetDebtRequest,
): number {
  const leftDeadline = left.deadlineFrame ?? Number.POSITIVE_INFINITY;
  const rightDeadline = right.deadlineFrame ?? Number.POSITIVE_INFINITY;
  return leftDeadline - rightDeadline;
}

function selectGpuFlowVisibleFrameOverBudgetDebtIds({
  maxContinuityDebtAgeFrames,
  maxSafetyDebtAgeFrames,
  requestedDebt,
}: {
  readonly maxContinuityDebtAgeFrames: number;
  readonly maxSafetyDebtAgeFrames: number;
  readonly requestedDebt: readonly GpuFlowVisibleFrameAgedBudgetDebtRequest[];
}): readonly string[] {
  return Object.freeze(
    requestedDebt
      .filter((debt) =>
        isGpuFlowVisibleFrameBudgetDebtOverBudget({
          debt,
          maxContinuityDebtAgeFrames,
          maxSafetyDebtAgeFrames,
        }),
      )
      .map((debt) => debt.id),
  );
}

function isGpuFlowVisibleFrameBudgetDebtOverBudget({
  debt,
  maxContinuityDebtAgeFrames,
  maxSafetyDebtAgeFrames,
}: {
  readonly debt: GpuFlowVisibleFrameAgedBudgetDebtRequest;
  readonly maxContinuityDebtAgeFrames: number;
  readonly maxSafetyDebtAgeFrames: number;
}): boolean {
  if (debt.priority === "safety") {
    return debt.debtAgeFrames > maxSafetyDebtAgeFrames;
  }
  if (debt.priority === "continuity") {
    return debt.debtAgeFrames > maxContinuityDebtAgeFrames;
  }
  return false;
}

function assertGpuFlowVisibleFrameBudgetDebtNotStarved({
  overBudgetDebtIds,
  selectedDebtIds,
}: {
  readonly overBudgetDebtIds: readonly string[];
  readonly selectedDebtIds: readonly string[];
}): void {
  const selectedDebtIdSet = new Set(selectedDebtIds);
  const starvedDebtIds = overBudgetDebtIds.filter(
    (debtId) => !selectedDebtIdSet.has(debtId),
  );
  if (starvedDebtIds.length === 0) {
    return;
  }
  throw new Error(
    `GPU Flow visible frame budget broker starved over-budget visible debt: ${starvedDebtIds.join(
      ", ",
    )}.`,
  );
}

function createGpuFlowVisibleFrameBudgetDebtIdsByLane(
  debt: readonly GpuFlowVisibleFrameAgedBudgetDebtRequest[],
): Partial<
  Record<GpuFlowVisibleFrameResourcePreparationLane, readonly string[]>
> {
  const idsByLane = new Map<
    GpuFlowVisibleFrameResourcePreparationLane,
    string[]
  >();
  for (const item of debt) {
    const lane = item.preparationLane;
    if (!lane) {
      continue;
    }
    const ids = idsByLane.get(lane) ?? [];
    ids.push(item.id);
    idsByLane.set(lane, ids);
  }
  return Object.freeze(
    Object.fromEntries(
      [...idsByLane].map(([lane, ids]) => [lane, Object.freeze(ids)]),
    ),
  );
}

export function createGpuFlowVisibleFrameBudgetDebtRequestsForResourceGraph({
  snapshot,
}: {
  readonly snapshot: GpuFlowVisibleFrameResourceGraphSnapshot;
}): readonly GpuFlowVisibleFrameBudgetDebtRequest[] {
  const activeResourceKeys = new Set([
    ...snapshot.candidateResourceKeys,
    ...snapshot.queuedResourceKeys,
  ]);
  return Object.freeze(
    snapshot.resourceStates
      .filter(isGpuFlowVisibleFrameResourceDebtState)
      .filter((state) => activeResourceKeys.has(state.resourceKey))
      .map(createGpuFlowVisibleFrameBudgetDebtRequestForResourceState),
  );
}

function isGpuFlowVisibleFrameResourceDebtState(
  state: GpuFlowVisibleFrameResourceStateSnapshot,
): boolean {
  return state.state === "requested" || state.state === "preparing";
}

function createGpuFlowVisibleFrameBudgetDebtRequestForResourceState(
  state: GpuFlowVisibleFrameResourceStateSnapshot,
): GpuFlowVisibleFrameBudgetDebtRequest {
  return Object.freeze({
    debtAgeFrames: state.debtAgeFrames,
    deadlineFrame: state.deadlineFrame,
    estimatedCostMs: state.estimatedCostMs,
    id: state.resourceKey,
    ownerFrameId: state.ownerFrameId,
    preparationLane: state.preparationLane,
    priority: state.priority,
    resourceState: state.state,
    source: "resource-graph",
  });
}

function selectGpuFlowVisibleFrameBrowserVisualDebt(
  requestedDebt: readonly GpuFlowVisibleFrameAgedBudgetDebtRequest[],
): GpuFlowVisibleFrameAgedBudgetDebtRequest | undefined {
  return (
    requestedDebt.find((debt) => debt.id === "browser-visual-repair") ??
    requestedDebt.find(isGpuFlowVisibleFrameBrowserVisualRepairDebt)
  );
}

function isGpuFlowVisibleFrameBrowserVisualRepairDebt(
  debt: Pick<
    GpuFlowVisibleFrameBudgetDebtRequest,
    "id" | "preparationLane" | "priority"
  >,
): boolean {
  return (
    debt.id === "browser-visual-repair" ||
    (debt.preparationLane === "browser-visual" && debt.priority === "safety")
  );
}

function isGpuFlowVisibleFrameResourceGraphBudgetDebt(
  debt: Pick<GpuFlowVisibleFrameBudgetDebtRequest, "source">,
): boolean {
  return debt.source === "resource-graph";
}

function isGpuFlowVisibleFrameSafetyOrContinuityDebt(
  debt: Pick<GpuFlowVisibleFrameBudgetDebtRequest, "priority">,
): boolean {
  return debt.priority === "safety" || debt.priority === "continuity";
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

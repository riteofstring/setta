import { measureGpuFlowPerformance } from "./gpuFlowPerformanceMarks";
import type { RetainedTextureBudget } from "./retainedTextureBudget";
import {
  RetainedTextureWorkQueue,
  retainedTextureWorkLaneForWorkItem,
  type RetainedTextureWorkItem,
  type RetainedTextureWorkLane,
  type RetainedTextureWorkQueueOptions,
} from "./retainedTextureWorkQueue";

export type RetainedTextureUploadSchedulerBudget = {
  readonly maxFrameRasterMs: number;
  readonly maxFrameUploadMs: number;
  readonly maxFrameUploadedBytes: number;
  readonly maxTextureMemoryBytes: number;
  readonly maxUploads: number;
};

type RetainedPageWorkBudget = {
  readonly activeIslandReserveBytes: number;
  readonly interactionFrameMaxMs: number;
  readonly prefetchMaxBytes: number;
  readonly refinementMaxBytes: number;
  readonly visibleCoverageReserveBytes: number;
  readonly visibleEdgeMaxUploads: number;
};

type RetainedSchedulerBudgets = {
  readonly visibleTrueHoleMinMs: number;
  readonly visibleTrueHoleMaxUploads: number;
  readonly activeIslandMinMs: number;
  readonly visibleRefinementOpportunisticMs: number;
  readonly prefetchMaxMs: number;
};

export type RetainedTextureUploadWorkEstimate = {
  readonly rasterMs: number;
  readonly uploadMs: number;
  readonly uploadedBytes: number;
  readonly uploadCount: number;
};

type RetainedTextureUploadWorkResult = RetainedTextureUploadWorkEstimate & {
  readonly complete: boolean;
};

export type RetainedTextureUploadExecutedWorkItem = RetainedTextureWorkItem & {
  readonly actual: RetainedTextureUploadWorkEstimate;
  readonly estimate: RetainedTextureUploadWorkEstimate;
  readonly lane: RetainedTextureWorkLane;
  readonly queue: RetainedTextureSchedulerQueue;
};

export type RetainedTextureUploadSchedulerDiagnostic = {
  readonly estimate: RetainedTextureUploadWorkEstimate;
  readonly item: RetainedTextureWorkItem;
  readonly lane: RetainedTextureWorkLane;
  readonly queue: RetainedTextureSchedulerQueue;
  readonly reason:
    | "actual-budget-miss"
    | "budget-exhausted"
    | "deadline-exhausted"
    | "deferred-deadline-yield"
    | "deferred-frame-slice";
};

type RetainedTextureUploadSchedulerResult = {
  readonly budget: RetainedTextureUploadSchedulerBudget;
  readonly budgetExhausted: boolean;
  readonly diagnostics: readonly RetainedTextureUploadSchedulerDiagnostic[];
  readonly executedItems: readonly RetainedTextureUploadExecutedWorkItem[];
  readonly remainingUploadableWorkCount: number;
  readonly rasterMs: number;
  readonly skippedItems: readonly RetainedTextureWorkItem[];
  readonly uploadMs: number;
  readonly uploadedBytes: number;
  readonly uploadCount: number;
};

type RetainedTextureSchedulerQueue =
  | "interactive"
  | "visible"
  | "prefetch";

type RunRetainedTextureUploadSchedulerInput = {
  readonly budget: RetainedTextureUploadSchedulerBudget;
  readonly deadlineMs?: number | undefined;
  readonly estimateWorkItem: (
    item: RetainedTextureWorkItem,
  ) => RetainedTextureUploadWorkEstimate;
  readonly executeWorkItem: (
    item: RetainedTextureWorkItem,
  ) => RetainedTextureUploadWorkResult;
  readonly now?: (() => number) | undefined;
  readonly pageWorkBudget?: Partial<RetainedPageWorkBudget> | undefined;
  readonly queue: RetainedTextureWorkQueue;
  readonly textureBudget?: RetainedTextureBudget | undefined;
  readonly viewportInteractionActive?: boolean | undefined;
};

type RetainedTextureUploadSchedulerProgress = {
  prefetchUploadedBytes: number;
  refinementUploadedBytes: number;
  rasterMs: number;
  uploadMs: number;
  uploadedBytes: number;
  uploadCount: number;
  visibleEdgeUploadCount: number;
};

type RetainedTextureSchedulerWorkContext = {
  readonly estimate: RetainedTextureUploadWorkEstimate;
  readonly item: RetainedTextureWorkItem;
  readonly lane: RetainedTextureWorkLane;
  readonly schedulerQueue: RetainedTextureSchedulerQueue;
};

type RetainedTextureSchedulerSkip = {
  readonly diagnostic: RetainedTextureUploadSchedulerDiagnostic;
  readonly stop: boolean;
};

export function runRetainedTextureUploadScheduler({
  budget,
  deadlineMs,
  estimateWorkItem,
  executeWorkItem,
  now = defaultRetainedTextureSchedulerNow,
  pageWorkBudget,
  queue,
  textureBudget,
  viewportInteractionActive,
}: RunRetainedTextureUploadSchedulerInput): RetainedTextureUploadSchedulerResult {
  const normalizedBudget = normalizeSchedulerBudget(budget);
  const normalizedPageWorkBudget = normalizeRetainedPageWorkBudget({
    budget: pageWorkBudget,
    schedulerBudget: normalizedBudget,
    textureBudget,
  });
  const retainedSchedulerBudgets = normalizeRetainedSchedulerBudgets({
    pageWorkBudget: normalizedPageWorkBudget,
    schedulerBudget: normalizedBudget,
  });
  const queueOptions = createRetainedTextureWorkQueueOptions({
    viewportInteractionActive,
  });
  const progress = createEmptyProgress();
  const diagnostics: RetainedTextureUploadSchedulerDiagnostic[] = [];
  const executedItems: RetainedTextureUploadExecutedWorkItem[] = [];
  const skippedItems: RetainedTextureWorkItem[] = [];
  const startedAtMs = now();
  const hardDeadlineMs = resolveRetainedTextureHardDeadlineMs({
    budget: normalizedBudget,
    deadlineMs,
  });

  for (const item of orderRetainedTextureWorkItems(queue, queueOptions)) {
    const context = createRetainedTextureSchedulerWorkContext({
      estimateWorkItem,
      item,
    });
    const preExecutionSkip = resolveRetainedTexturePreExecutionSkip({
      budget: normalizedBudget,
      context,
      hardDeadlineMs,
      now,
      pageWorkBudget: normalizedPageWorkBudget,
      progress,
      retainedSchedulerBudgets,
      startedAtMs,
      textureBudget,
    });
    if (preExecutionSkip) {
      diagnostics.push(preExecutionSkip.diagnostic);
      skippedItems.push(item);
      if (preExecutionSkip.stop) {
        break;
      }
      continue;
    }

    const result = normalizeWorkResult(executeWorkItem(item));
    addProgress(progress, result, item, context.schedulerQueue);
    executedItems.push(
      createRetainedTextureUploadExecutedWorkItem({
        context,
        result,
      }),
    );
    if (result.complete) {
      queue.complete(item);
    }
    const postExecutionBudgetMiss = createRetainedTextureActualBudgetMiss({
      budget: normalizedBudget,
      context,
      pageWorkBudget: normalizedPageWorkBudget,
      progress,
      result,
      retainedSchedulerBudgets,
    });
    if (postExecutionBudgetMiss) {
      diagnostics.push(postExecutionBudgetMiss);
      break;
    }
    if (
      shouldStopRetainedTextureSchedulerForDeadline({
        hardDeadlineMs,
        now,
        progress,
        startedAtMs,
      })
    ) {
      break;
    }
  }

  const remainingUploadableWork = orderRetainedTextureWorkItems(
    queue,
    queueOptions,
  );

  return {
    budget: normalizedBudget,
    budgetExhausted: hasRetainedTextureBudgetExhaustion({
      remainingUploadableWork,
      skippedItems,
    }),
    diagnostics,
    executedItems,
    remainingUploadableWorkCount: remainingUploadableWork.length,
    rasterMs: progress.rasterMs,
    skippedItems,
    uploadMs: progress.uploadMs,
    uploadedBytes: progress.uploadedBytes,
    uploadCount: progress.uploadCount,
  };
}

function createRetainedTextureUploadExecutedWorkItem({
  context,
  result,
}: {
  readonly context: RetainedTextureSchedulerWorkContext;
  readonly result: RetainedTextureUploadWorkResult;
}): RetainedTextureUploadExecutedWorkItem {
  return {
    ...context.item,
    actual: {
      rasterMs: result.rasterMs,
      uploadedBytes: result.uploadedBytes,
      uploadCount: result.uploadCount,
      uploadMs: result.uploadMs,
    },
    estimate: context.estimate,
    lane: context.lane,
    queue: context.schedulerQueue,
  };
}

function orderRetainedTextureWorkItems(
  queue: RetainedTextureWorkQueue,
  queueOptions: RetainedTextureWorkQueueOptions,
): readonly RetainedTextureWorkItem[] {
  return measureGpuFlowPerformance(
    "retained-work-queue-ordering",
    {
      viewportInteractionActive: Boolean(
        queueOptions.viewportInteractionActive,
      ),
    },
    () => queue.orderedWorkItems(queueOptions),
  );
}

function createRetainedTextureWorkQueueOptions({
  viewportInteractionActive,
}: {
  readonly viewportInteractionActive: boolean | undefined;
}): RetainedTextureWorkQueueOptions {
  return {
    viewportInteractionActive: Boolean(viewportInteractionActive),
  };
}

function resolveRetainedTextureHardDeadlineMs({
  budget,
  deadlineMs,
}: {
  readonly budget: RetainedTextureUploadSchedulerBudget;
  readonly deadlineMs: number | undefined;
}): number {
  if (deadlineMs !== undefined) {
    return deadlineMs;
  }
  return Math.max(0, budget.maxFrameRasterMs + budget.maxFrameUploadMs);
}

function hasRetainedTextureBudgetExhaustion({
  remainingUploadableWork,
  skippedItems,
}: {
  readonly remainingUploadableWork: readonly RetainedTextureWorkItem[];
  readonly skippedItems: readonly RetainedTextureWorkItem[];
}): boolean {
  return [...skippedItems, ...remainingUploadableWork].some(
    isRetainedTextureBlockingRepairWork,
  );
}

function createRetainedTextureSchedulerWorkContext({
  estimateWorkItem,
  item,
}: {
  readonly estimateWorkItem: (
    item: RetainedTextureWorkItem,
  ) => RetainedTextureUploadWorkEstimate;
  readonly item: RetainedTextureWorkItem;
}): RetainedTextureSchedulerWorkContext {
  return {
    estimate: normalizeWorkEstimate(estimateWorkItem(item)),
    item,
    lane: retainedTextureWorkLaneForWorkItem(item),
    schedulerQueue: retainedTextureSchedulerQueueForWorkItem(item),
  };
}

function resolveRetainedTexturePreExecutionSkip({
  budget,
  context,
  hardDeadlineMs,
  now,
  pageWorkBudget,
  progress,
  retainedSchedulerBudgets,
  startedAtMs,
  textureBudget,
}: {
  readonly budget: RetainedTextureUploadSchedulerBudget;
  readonly context: RetainedTextureSchedulerWorkContext;
  readonly hardDeadlineMs: number;
  readonly now: () => number;
  readonly pageWorkBudget: RetainedPageWorkBudget;
  readonly progress: RetainedTextureUploadSchedulerProgress;
  readonly retainedSchedulerBudgets: RetainedSchedulerBudgets;
  readonly startedAtMs: number;
  readonly textureBudget: RetainedTextureBudget | undefined;
}): RetainedTextureSchedulerSkip | null {
  if (
    shouldStopRetainedTextureSchedulerForDeadline({
      hardDeadlineMs,
      now,
      progress,
      startedAtMs,
    })
  ) {
    return createRetainedTextureSchedulerSkip({
      context,
      reason: "deadline-exhausted",
      stop: true,
    });
  }
  if (
    shouldSkipRetainedTextureWorkItem({
      budget,
      estimate: context.estimate,
      item: context.item,
      lane: context.lane,
      pageWorkBudget,
      progress,
      retainedSchedulerBudgets,
      schedulerQueue: context.schedulerQueue,
      textureBudget,
    })
  ) {
    return createRetainedTextureSchedulerSkip({
      context,
      reason: "budget-exhausted",
      stop: false,
    });
  }
  return null;
}

function createRetainedTextureSchedulerSkip({
  context,
  reason,
  stop,
}: {
  readonly context: RetainedTextureSchedulerWorkContext;
  readonly reason: "budget-exhausted" | "deadline-exhausted";
  readonly stop: boolean;
}): RetainedTextureSchedulerSkip {
  return {
    diagnostic: createRetainedTextureBudgetExhaustedDiagnostic({
      estimate: context.estimate,
      item: context.item,
      lane: context.lane,
      reason: resolveRetainedTextureSkipDiagnosticReason({
        lane: context.lane,
        reason,
      }),
      schedulerQueue: context.schedulerQueue,
    }),
    stop,
  };
}

function resolveRetainedTextureSkipDiagnosticReason({
  lane,
  reason,
}: {
  readonly lane: RetainedTextureWorkLane;
  readonly reason: "budget-exhausted" | "deadline-exhausted";
}): RetainedTextureUploadSchedulerDiagnostic["reason"] {
  if (lane === "visible-repair") {
    return reason;
  }
  return reason === "deadline-exhausted"
    ? "deferred-deadline-yield"
    : "deferred-frame-slice";
}

function createRetainedTextureActualBudgetMiss({
  budget,
  context,
  pageWorkBudget,
  progress,
  result,
  retainedSchedulerBudgets,
}: {
  readonly budget: RetainedTextureUploadSchedulerBudget;
  readonly context: RetainedTextureSchedulerWorkContext;
  readonly pageWorkBudget: RetainedPageWorkBudget;
  readonly progress: RetainedTextureUploadSchedulerProgress;
  readonly result: RetainedTextureUploadWorkResult;
  readonly retainedSchedulerBudgets: RetainedSchedulerBudgets;
}): RetainedTextureUploadSchedulerDiagnostic | null {
  if (fitsBudget(createEmptyProgress(), progress, budget)) {
    return null;
  }
  if (
    fitsVisibleRepairBudget(
      progress,
      budget,
      pageWorkBudget,
      retainedSchedulerBudgets,
    )
  ) {
    return null;
  }
  return {
    estimate: result,
    item: context.item,
    lane: context.lane,
    queue: context.schedulerQueue,
    reason: "actual-budget-miss",
  };
}

function shouldSkipRetainedTextureWorkItem({
  budget,
  estimate,
  item,
  lane,
  pageWorkBudget,
  progress,
  retainedSchedulerBudgets,
  schedulerQueue,
  textureBudget,
}: {
  readonly budget: RetainedTextureUploadSchedulerBudget;
  readonly estimate: RetainedTextureUploadWorkEstimate;
  readonly item: RetainedTextureWorkItem;
  readonly lane: RetainedTextureWorkLane;
  readonly pageWorkBudget: RetainedPageWorkBudget;
  readonly progress: RetainedTextureUploadSchedulerProgress;
  readonly retainedSchedulerBudgets: RetainedSchedulerBudgets;
  readonly schedulerQueue: RetainedTextureSchedulerQueue;
  readonly textureBudget: RetainedTextureBudget | undefined;
}): boolean {
  if (lane === "cleanup") {
    return true;
  }
  if (
    shouldSkipNonVisibleWorkForPageBudget({
      estimate,
      item,
      pageWorkBudget,
      progress,
      retainedSchedulerBudgets,
      schedulerQueue,
    })
  ) {
    return true;
  }
  if (
    shouldSkipPrefetchForTextureBudget({
      estimate,
      progress,
      schedulerQueue,
      textureBudget,
    })
  ) {
    return true;
  }
  return (
    !fitsBudget(progress, estimate, budget) &&
    !canForceRetainedTextureUploadProgress({
      budget,
      estimate,
      item,
      pageWorkBudget,
      progress,
      retainedSchedulerBudgets,
    })
  );
}

function createRetainedTextureBudgetExhaustedDiagnostic({
  estimate,
  item,
  lane,
  reason,
  schedulerQueue,
}: {
  readonly estimate: RetainedTextureUploadWorkEstimate;
  readonly item: RetainedTextureWorkItem;
  readonly lane: RetainedTextureWorkLane;
  readonly reason: RetainedTextureUploadSchedulerDiagnostic["reason"];
  readonly schedulerQueue: RetainedTextureSchedulerQueue;
}): RetainedTextureUploadSchedulerDiagnostic {
  return {
    estimate,
    item,
    lane,
    queue: schedulerQueue,
    reason,
  };
}

function shouldStopRetainedTextureSchedulerForDeadline({
  hardDeadlineMs,
  now,
  progress,
  startedAtMs,
}: {
  readonly hardDeadlineMs: number;
  readonly now: () => number;
  readonly progress: RetainedTextureUploadSchedulerProgress;
  readonly startedAtMs: number;
}): boolean {
  return (
    hardDeadlineMs <= 0 ||
    progress.rasterMs + progress.uploadMs >= hardDeadlineMs ||
    now() - startedAtMs >= hardDeadlineMs
  );
}

function shouldSkipPrefetchForTextureBudget({
  estimate,
  progress,
  schedulerQueue,
  textureBudget,
}: {
  readonly estimate: RetainedTextureUploadWorkEstimate;
  readonly progress: RetainedTextureUploadSchedulerProgress;
  readonly schedulerQueue: RetainedTextureSchedulerQueue;
  readonly textureBudget: RetainedTextureBudget | undefined;
}): boolean {
  return (
    schedulerQueue === "prefetch" &&
    Boolean(textureBudget) &&
    progress.prefetchUploadedBytes + estimate.uploadedBytes >
      (textureBudget?.offscreenPrefetchMaxBytes ?? 0)
  );
}

function shouldSkipNonVisibleWorkForPageBudget({
  estimate,
  item,
  pageWorkBudget,
  progress,
  retainedSchedulerBudgets,
  schedulerQueue,
}: {
  readonly estimate: RetainedTextureUploadWorkEstimate;
  readonly item: RetainedTextureWorkItem;
  readonly pageWorkBudget: RetainedPageWorkBudget;
  readonly progress: RetainedTextureUploadSchedulerProgress;
  readonly retainedSchedulerBudgets: RetainedSchedulerBudgets;
  readonly schedulerQueue: RetainedTextureSchedulerQueue;
}): boolean {
  if (item.kind === "first-visible" || schedulerQueue === "interactive") {
    return false;
  }
  if (
    item.kind === "lod-refinement" &&
    (progress.refinementUploadedBytes + estimate.uploadedBytes >
      pageWorkBudget.refinementMaxBytes ||
      progress.rasterMs +
        progress.uploadMs +
        estimate.rasterMs +
        estimate.uploadMs >
        retainedSchedulerBudgets.visibleRefinementOpportunisticMs)
  ) {
    return true;
  }
  return (
    schedulerQueue === "prefetch" &&
    (progress.prefetchUploadedBytes + estimate.uploadedBytes >
      pageWorkBudget.prefetchMaxBytes ||
      progress.rasterMs +
        progress.uploadMs +
        estimate.rasterMs +
        estimate.uploadMs >
        retainedSchedulerBudgets.prefetchMaxMs)
  );
}

function canForceRetainedTextureUploadProgress({
  budget,
  estimate,
  item,
  pageWorkBudget,
  progress,
  retainedSchedulerBudgets,
}: {
  readonly budget: RetainedTextureUploadSchedulerBudget;
  readonly estimate: RetainedTextureUploadWorkEstimate;
  readonly item: RetainedTextureWorkItem;
  readonly pageWorkBudget: RetainedPageWorkBudget;
  readonly progress: RetainedTextureUploadSchedulerProgress;
  readonly retainedSchedulerBudgets: RetainedSchedulerBudgets;
}): boolean {
  if (item.kind !== "first-visible") {
    return false;
  }
  const firstVisibleUploadProgress =
    progress.uploadCount === 0 && progress.uploadedBytes === 0;
  const visibleEdgeUploadAvailable =
    progress.visibleEdgeUploadCount + estimate.uploadCount <=
    retainedSchedulerBudgets.visibleTrueHoleMaxUploads;
  const visibleRepairBytesAvailable =
    firstVisibleUploadProgress ||
    progress.uploadedBytes + estimate.uploadedBytes <=
      pageWorkBudget.visibleCoverageReserveBytes;
  const visibleRepairTimeAvailable =
    progress.rasterMs +
      progress.uploadMs +
      estimate.rasterMs +
      estimate.uploadMs <=
    Math.max(
      retainedSchedulerBudgets.visibleTrueHoleMinMs,
      budget.maxFrameRasterMs + budget.maxFrameUploadMs,
    );
  return (
    visibleEdgeUploadAvailable &&
    visibleRepairBytesAvailable &&
    budget.maxUploads > 0 &&
    estimate.uploadCount > 0 &&
    visibleRepairTimeAvailable
  );
}

function fitsVisibleRepairBudget(
  progress: RetainedTextureUploadSchedulerProgress,
  budget: RetainedTextureUploadSchedulerBudget,
  pageWorkBudget: RetainedPageWorkBudget,
  retainedSchedulerBudgets: RetainedSchedulerBudgets,
): boolean {
  return (
    progress.uploadCount > 0 &&
    progress.uploadCount === progress.visibleEdgeUploadCount &&
    progress.visibleEdgeUploadCount <=
      retainedSchedulerBudgets.visibleTrueHoleMaxUploads &&
    progress.uploadedBytes <= pageWorkBudget.visibleCoverageReserveBytes &&
    progress.rasterMs + progress.uploadMs <=
      Math.max(
        retainedSchedulerBudgets.visibleTrueHoleMinMs,
        budget.maxFrameRasterMs + budget.maxFrameUploadMs,
      )
  );
}

export function retainedTextureSchedulerQueueForWorkItem(
  item: Pick<RetainedTextureWorkItem, "kind" | "priority">,
): RetainedTextureSchedulerQueue {
  if (item.priority === "interactive") {
    return "interactive";
  }
  if (item.priority === "prefetch") {
    return "prefetch";
  }
  return "visible";
}

function fitsBudget(
  current: RetainedTextureUploadSchedulerProgress,
  next: RetainedTextureUploadWorkEstimate,
  budget: RetainedTextureUploadSchedulerBudget,
): boolean {
  return (
    current.rasterMs + next.rasterMs <= budget.maxFrameRasterMs &&
    current.uploadMs + next.uploadMs <= budget.maxFrameUploadMs &&
    current.uploadedBytes + next.uploadedBytes <=
      budget.maxFrameUploadedBytes &&
    current.uploadCount + next.uploadCount <= budget.maxUploads
  );
}

function isRetainedTextureBlockingRepairWork(
  item: RetainedTextureWorkItem,
): boolean {
  return retainedTextureWorkLaneForWorkItem(item) === "visible-repair";
}

function addProgress(
  progress: RetainedTextureUploadSchedulerProgress,
  result: RetainedTextureUploadWorkEstimate,
  item: RetainedTextureWorkItem,
  queue: RetainedTextureSchedulerQueue,
) {
  if (queue === "prefetch") {
    progress.prefetchUploadedBytes += result.uploadedBytes;
  }
  if (item.kind === "lod-refinement") {
    progress.refinementUploadedBytes += result.uploadedBytes;
  }
  if (item.kind === "first-visible") {
    progress.visibleEdgeUploadCount += result.uploadCount;
  }
  progress.rasterMs += result.rasterMs;
  progress.uploadMs += result.uploadMs;
  progress.uploadedBytes += result.uploadedBytes;
  progress.uploadCount += result.uploadCount;
}

function createEmptyProgress(): RetainedTextureUploadSchedulerProgress {
  return {
    prefetchUploadedBytes: 0,
    refinementUploadedBytes: 0,
    rasterMs: 0,
    uploadMs: 0,
    uploadedBytes: 0,
    uploadCount: 0,
    visibleEdgeUploadCount: 0,
  };
}

function normalizeRetainedPageWorkBudget({
  budget,
  schedulerBudget,
  textureBudget,
}: {
  readonly budget: Partial<RetainedPageWorkBudget> | undefined;
  readonly schedulerBudget: RetainedTextureUploadSchedulerBudget;
  readonly textureBudget: RetainedTextureBudget | undefined;
}): RetainedPageWorkBudget {
  return {
    activeIslandReserveBytes: normalizeFiniteNonNegativeNumber(
      "activeIslandReserveBytes",
      resolveActiveIslandReserveBytes(budget, textureBudget),
    ),
    interactionFrameMaxMs: normalizeFiniteNonNegativeNumber(
      "interactionFrameMaxMs",
      resolveInteractionFrameMaxMs(budget, schedulerBudget),
    ),
    prefetchMaxBytes: normalizeFiniteNonNegativeNumber(
      "prefetchMaxBytes",
      resolvePrefetchMaxBytes(budget, textureBudget, schedulerBudget),
    ),
    refinementMaxBytes: normalizeFiniteNonNegativeNumber(
      "refinementMaxBytes",
      resolveRefinementMaxBytes(budget, textureBudget, schedulerBudget),
    ),
    visibleCoverageReserveBytes: normalizeFiniteNonNegativeNumber(
      "visibleCoverageReserveBytes",
      resolveVisibleCoverageReserveBytes(budget, textureBudget),
    ),
    visibleEdgeMaxUploads: normalizeFiniteNonNegativeInteger(
      "visibleEdgeMaxUploads",
      resolveVisibleEdgeMaxUploads(budget, schedulerBudget),
    ),
  };
}

function normalizeRetainedSchedulerBudgets({
  pageWorkBudget,
  schedulerBudget,
}: {
  readonly pageWorkBudget: RetainedPageWorkBudget;
  readonly schedulerBudget: RetainedTextureUploadSchedulerBudget;
}): RetainedSchedulerBudgets {
  const frameMs =
    schedulerBudget.maxFrameRasterMs + schedulerBudget.maxFrameUploadMs;
  return {
    activeIslandMinMs: normalizeFiniteNonNegativeNumber(
      "activeIslandMinMs",
      Math.min(pageWorkBudget.interactionFrameMaxMs, frameMs),
    ),
    prefetchMaxMs: normalizeFiniteNonNegativeNumber(
      "prefetchMaxMs",
      pageWorkBudget.interactionFrameMaxMs,
    ),
    visibleRefinementOpportunisticMs: normalizeFiniteNonNegativeNumber(
      "visibleRefinementOpportunisticMs",
      pageWorkBudget.interactionFrameMaxMs,
    ),
    visibleTrueHoleMaxUploads: normalizeFiniteNonNegativeInteger(
      "visibleTrueHoleMaxUploads",
      pageWorkBudget.visibleEdgeMaxUploads,
    ),
    visibleTrueHoleMinMs: normalizeFiniteNonNegativeNumber(
      "visibleTrueHoleMinMs",
      Math.min(pageWorkBudget.interactionFrameMaxMs, frameMs),
    ),
  };
}

function resolveActiveIslandReserveBytes(
  budget: Partial<RetainedPageWorkBudget> | undefined,
  textureBudget: RetainedTextureBudget | undefined,
): number {
  return firstDefinedNumber(
    budget?.activeIslandReserveBytes,
    textureBudget?.activeIslandReserveBytes,
    0,
  );
}

function resolveInteractionFrameMaxMs(
  budget: Partial<RetainedPageWorkBudget> | undefined,
  schedulerBudget: RetainedTextureUploadSchedulerBudget,
): number {
  return firstDefinedNumber(
    budget?.interactionFrameMaxMs,
    schedulerBudget.maxFrameRasterMs + schedulerBudget.maxFrameUploadMs,
  );
}

function resolvePrefetchMaxBytes(
  budget: Partial<RetainedPageWorkBudget> | undefined,
  textureBudget: RetainedTextureBudget | undefined,
  schedulerBudget: RetainedTextureUploadSchedulerBudget,
): number {
  return firstDefinedNumber(
    budget?.prefetchMaxBytes,
    textureBudget?.offscreenPrefetchMaxBytes,
    schedulerBudget.maxFrameUploadedBytes,
  );
}

function resolveRefinementMaxBytes(
  budget: Partial<RetainedPageWorkBudget> | undefined,
  textureBudget: RetainedTextureBudget | undefined,
  schedulerBudget: RetainedTextureUploadSchedulerBudget,
): number {
  return firstDefinedNumber(
    budget?.refinementMaxBytes,
    textureBudget?.nearViewportReserveBytes,
    schedulerBudget.maxFrameUploadedBytes,
  );
}

function resolveVisibleCoverageReserveBytes(
  budget: Partial<RetainedPageWorkBudget> | undefined,
  textureBudget: RetainedTextureBudget | undefined,
): number {
  return firstDefinedNumber(
    budget?.visibleCoverageReserveBytes,
    textureBudget?.visibleReserveBytes,
    0,
  );
}

function resolveVisibleEdgeMaxUploads(
  budget: Partial<RetainedPageWorkBudget> | undefined,
  schedulerBudget: RetainedTextureUploadSchedulerBudget,
): number {
  return firstDefinedNumber(
    budget?.visibleEdgeMaxUploads,
    schedulerBudget.maxUploads,
  );
}

function firstDefinedNumber(
  ...values: readonly (number | undefined)[]
): number {
  for (const value of values) {
    if (value !== undefined) {
      return value;
    }
  }
  return 0;
}

function normalizeSchedulerBudget(
  budget: RetainedTextureUploadSchedulerBudget,
): RetainedTextureUploadSchedulerBudget {
  return {
    maxFrameRasterMs: normalizeFiniteNonNegativeNumber(
      "maxFrameRasterMs",
      budget.maxFrameRasterMs,
    ),
    maxFrameUploadMs: normalizeFiniteNonNegativeNumber(
      "maxFrameUploadMs",
      budget.maxFrameUploadMs,
    ),
    maxFrameUploadedBytes: normalizeFiniteNonNegativeNumber(
      "maxFrameUploadedBytes",
      budget.maxFrameUploadedBytes,
    ),
    maxTextureMemoryBytes: normalizeFiniteNonNegativeNumber(
      "maxTextureMemoryBytes",
      budget.maxTextureMemoryBytes,
    ),
    maxUploads: normalizeFiniteNonNegativeInteger(
      "maxUploads",
      budget.maxUploads,
    ),
  };
}

function normalizeWorkResult(
  result: RetainedTextureUploadWorkResult,
): RetainedTextureUploadWorkResult {
  return {
    ...normalizeWorkEstimate(result),
    complete: result.complete,
  };
}

function normalizeWorkEstimate(
  estimate: RetainedTextureUploadWorkEstimate,
): RetainedTextureUploadWorkEstimate {
  return {
    rasterMs: normalizeFiniteNonNegativeNumber("rasterMs", estimate.rasterMs),
    uploadMs: normalizeFiniteNonNegativeNumber("uploadMs", estimate.uploadMs),
    uploadedBytes: normalizeFiniteNonNegativeNumber(
      "uploadedBytes",
      estimate.uploadedBytes,
    ),
    uploadCount: normalizeFiniteNonNegativeInteger(
      "uploadCount",
      estimate.uploadCount,
    ),
  };
}

function defaultRetainedTextureSchedulerNow(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function normalizeFiniteNonNegativeNumber(name: string, value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(
      `Retained texture upload scheduler ${name} must be finite and non-negative.`,
    );
  }
  return value;
}

function normalizeFiniteNonNegativeInteger(
  name: string,
  value: number,
): number {
  const normalized = normalizeFiniteNonNegativeNumber(name, value);
  if (!Number.isInteger(normalized)) {
    throw new Error(
      `Retained texture upload scheduler ${name} must be an integer.`,
    );
  }
  return normalized;
}

import type { RetainedTextureBudget } from "./retainedTextureBudget";
import {
  RetainedTextureWorkQueue,
  type RetainedTextureWorkItem,
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

type RetainedTextureUploadWorkResult =
  RetainedTextureUploadWorkEstimate & {
    readonly complete: boolean;
  };

export type RetainedTextureUploadSchedulerDiagnostic = {
  readonly estimate: RetainedTextureUploadWorkEstimate;
  readonly item: RetainedTextureWorkItem;
  readonly queue: RetainedTextureSchedulerQueue;
  readonly reason: "budget-exhausted" | "actual-budget-miss";
};

type RetainedTextureUploadSchedulerResult = {
  readonly budget: RetainedTextureUploadSchedulerBudget;
  readonly budgetExhausted: boolean;
  readonly diagnostics: readonly RetainedTextureUploadSchedulerDiagnostic[];
  readonly executedItems: readonly RetainedTextureWorkItem[];
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
  readonly estimateWorkItem: (
    item: RetainedTextureWorkItem,
  ) => RetainedTextureUploadWorkEstimate;
  readonly executeWorkItem: (
    item: RetainedTextureWorkItem,
  ) => RetainedTextureUploadWorkResult;
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

export function runRetainedTextureUploadScheduler({
  budget,
  estimateWorkItem,
  executeWorkItem,
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
  const queueOptions: RetainedTextureWorkQueueOptions = {
    viewportInteractionActive: viewportInteractionActive ?? false,
  };
  const progress = createEmptyProgress();
  const diagnostics: RetainedTextureUploadSchedulerDiagnostic[] = [];
  const executedItems: RetainedTextureWorkItem[] = [];
  const skippedItems: RetainedTextureWorkItem[] = [];

  for (const item of queue.orderedWorkItems(queueOptions)) {
    const estimate = normalizeWorkEstimate(estimateWorkItem(item));
    const schedulerQueue = retainedTextureSchedulerQueueForWorkItem(item);
    if (
      shouldSkipRetainedTextureWorkItem({
        budget: normalizedBudget,
        estimate,
        item,
        pageWorkBudget: normalizedPageWorkBudget,
        progress,
        retainedSchedulerBudgets,
        schedulerQueue,
        textureBudget,
      })
    ) {
      diagnostics.push(
        createRetainedTextureBudgetExhaustedDiagnostic({
          estimate,
          item,
          schedulerQueue,
        }),
      );
      skippedItems.push(item);
      continue;
    }

    const result = normalizeWorkResult(executeWorkItem(item));
    addProgress(progress, result, item, schedulerQueue);
    executedItems.push(item);
    if (result.complete) {
      queue.complete(item);
    }
    if (!fitsBudget(createEmptyProgress(), progress, normalizedBudget)) {
      diagnostics.push({
        estimate: result,
        item,
        queue: schedulerQueue,
        reason: "actual-budget-miss",
      });
      break;
    }
  }

  const remainingUploadableWorkCount =
    queue.orderedWorkItems(queueOptions).length;

  return {
    budget: normalizedBudget,
    budgetExhausted:
      skippedItems.length > 0 || remainingUploadableWorkCount > 0,
    diagnostics,
    executedItems,
    remainingUploadableWorkCount,
    rasterMs: progress.rasterMs,
    skippedItems,
    uploadMs: progress.uploadMs,
    uploadedBytes: progress.uploadedBytes,
    uploadCount: progress.uploadCount,
  };
}

function shouldSkipRetainedTextureWorkItem({
  budget,
  estimate,
  item,
  pageWorkBudget,
  progress,
  retainedSchedulerBudgets,
  schedulerQueue,
  textureBudget,
}: {
  readonly budget: RetainedTextureUploadSchedulerBudget;
  readonly estimate: RetainedTextureUploadWorkEstimate;
  readonly item: RetainedTextureWorkItem;
  readonly pageWorkBudget: RetainedPageWorkBudget;
  readonly progress: RetainedTextureUploadSchedulerProgress;
  readonly retainedSchedulerBudgets: RetainedSchedulerBudgets;
  readonly schedulerQueue: RetainedTextureSchedulerQueue;
  readonly textureBudget: RetainedTextureBudget | undefined;
}): boolean {
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
      progress,
      retainedSchedulerBudgets,
    })
  );
}

function createRetainedTextureBudgetExhaustedDiagnostic({
  estimate,
  item,
  schedulerQueue,
}: {
  readonly estimate: RetainedTextureUploadWorkEstimate;
  readonly item: RetainedTextureWorkItem;
  readonly schedulerQueue: RetainedTextureSchedulerQueue;
}): RetainedTextureUploadSchedulerDiagnostic {
  return {
    estimate,
    item,
    queue: schedulerQueue,
    reason: "budget-exhausted",
  };
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
  progress,
  retainedSchedulerBudgets,
}: {
  readonly budget: RetainedTextureUploadSchedulerBudget;
  readonly estimate: RetainedTextureUploadWorkEstimate;
  readonly item: RetainedTextureWorkItem;
  readonly progress: RetainedTextureUploadSchedulerProgress;
  readonly retainedSchedulerBudgets: RetainedSchedulerBudgets;
}): boolean {
  const visibleEdgeUploadAvailable =
    item.kind === "first-visible" &&
    progress.visibleEdgeUploadCount <
      retainedSchedulerBudgets.visibleTrueHoleMaxUploads;
  const visibleRepairTimeAvailable =
    estimate.rasterMs + estimate.uploadMs <=
    Math.max(
      retainedSchedulerBudgets.visibleTrueHoleMinMs,
      budget.maxFrameRasterMs + budget.maxFrameUploadMs,
    );
  return (
    (progress.uploadCount === 0 || visibleEdgeUploadAvailable) &&
    progress.uploadedBytes === 0 &&
    progress.rasterMs === 0 &&
    progress.uploadMs === 0 &&
    budget.maxUploads > 0 &&
    estimate.uploadCount > 0 &&
    visibleRepairTimeAvailable
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

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

export type RetainedTextureUploadWorkEstimate = {
  readonly rasterMs: number;
  readonly uploadMs: number;
  readonly uploadedBytes: number;
  readonly uploadCount: number;
};

export type RetainedTextureUploadWorkResult =
  RetainedTextureUploadWorkEstimate & {
    readonly complete: boolean;
  };

export type RetainedTextureUploadSchedulerDiagnostic = {
  readonly estimate: RetainedTextureUploadWorkEstimate;
  readonly item: RetainedTextureWorkItem;
  readonly queue: RetainedTextureSchedulerQueue;
  readonly reason: "budget-exhausted" | "actual-budget-miss";
};

export type RetainedTextureUploadSchedulerResult = {
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

export type RetainedTextureSchedulerQueue =
  | "interactive"
  | "visible"
  | "prefetch";

export type RunRetainedTextureUploadSchedulerInput = {
  readonly budget: RetainedTextureUploadSchedulerBudget;
  readonly estimateWorkItem: (
    item: RetainedTextureWorkItem,
  ) => RetainedTextureUploadWorkEstimate;
  readonly executeWorkItem: (
    item: RetainedTextureWorkItem,
  ) => RetainedTextureUploadWorkResult;
  readonly queue: RetainedTextureWorkQueue;
  readonly textureBudget?: RetainedTextureBudget | undefined;
  readonly viewportInteractionActive?: boolean | undefined;
};

type RetainedTextureUploadSchedulerProgress = {
  prefetchUploadedBytes: number;
  rasterMs: number;
  uploadMs: number;
  uploadedBytes: number;
  uploadCount: number;
};

export function runRetainedTextureUploadScheduler({
  budget,
  estimateWorkItem,
  executeWorkItem,
  queue,
  textureBudget,
  viewportInteractionActive,
}: RunRetainedTextureUploadSchedulerInput): RetainedTextureUploadSchedulerResult {
  const normalizedBudget = normalizeSchedulerBudget(budget);
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
      shouldSkipPrefetchForTextureBudget({
        estimate,
        progress,
        schedulerQueue,
        textureBudget,
      })
    ) {
      diagnostics.push({
        estimate,
        item,
        queue: schedulerQueue,
        reason: "budget-exhausted",
      });
      skippedItems.push(item);
      continue;
    }
    if (
      !fitsBudget(progress, estimate, normalizedBudget) &&
      !canForceRetainedTextureUploadProgress({
        budget: normalizedBudget,
        estimate,
        progress,
      })
    ) {
      diagnostics.push({
        estimate,
        item,
        queue: schedulerQueue,
        reason: "budget-exhausted",
      });
      skippedItems.push(item);
      continue;
    }

    const result = normalizeWorkResult(executeWorkItem(item));
    addProgress(progress, result, schedulerQueue);
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

function canForceRetainedTextureUploadProgress({
  budget,
  estimate,
  progress,
}: {
  readonly budget: RetainedTextureUploadSchedulerBudget;
  readonly estimate: RetainedTextureUploadWorkEstimate;
  readonly progress: RetainedTextureUploadSchedulerProgress;
}): boolean {
  return (
    progress.uploadCount === 0 &&
    progress.uploadedBytes === 0 &&
    progress.rasterMs === 0 &&
    progress.uploadMs === 0 &&
    budget.maxUploads > 0 &&
    estimate.uploadCount > 0
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
  queue: RetainedTextureSchedulerQueue,
) {
  if (queue === "prefetch") {
    progress.prefetchUploadedBytes += result.uploadedBytes;
  }
  progress.rasterMs += result.rasterMs;
  progress.uploadMs += result.uploadMs;
  progress.uploadedBytes += result.uploadedBytes;
  progress.uploadCount += result.uploadCount;
}

function createEmptyProgress(): RetainedTextureUploadSchedulerProgress {
  return {
    prefetchUploadedBytes: 0,
    rasterMs: 0,
    uploadMs: 0,
    uploadedBytes: 0,
    uploadCount: 0,
  };
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

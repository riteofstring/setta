import { describe, expect, it } from "vitest";

import {
  retainedTextureSchedulerQueueForWorkItem,
  runRetainedTextureUploadScheduler,
  type RetainedTextureUploadSchedulerBudget,
  type RetainedTextureUploadWorkEstimate,
} from "./retainedTextureUploadScheduler";
import { RetainedTextureWorkQueue } from "./retainedTextureWorkQueue";

const DEFAULT_BUDGET: RetainedTextureUploadSchedulerBudget = {
  maxFrameRasterMs: 4,
  maxFrameUploadMs: 4,
  maxFrameUploadedBytes: 1_000,
  maxTextureMemoryBytes: 192 * 1024 * 1024,
  maxUploads: 2,
};

const SMALL_WORK: RetainedTextureUploadWorkEstimate = {
  rasterMs: 1,
  uploadCount: 1,
  uploadedBytes: 400,
  uploadMs: 1,
};

describe("runRetainedTextureUploadScheduler", () => {
  it("executes uploadable work within budget and clears completed items", () => {
    const queue = new RetainedTextureWorkQueue();
    queue.enqueue({
      contentVersion: 1,
      kind: "content-rect",
      sourceRect: { height: 10, width: 10, x: 0, y: 0 },
      surfaceId: "surface-a",
    });

    const result = runRetainedTextureUploadScheduler({
      budget: DEFAULT_BUDGET,
      estimateWorkItem: () => SMALL_WORK,
      executeWorkItem: () => ({ ...SMALL_WORK, complete: true }),
      queue,
    });

    expect(result).toMatchObject({
      budgetExhausted: false,
      remainingUploadableWorkCount: 0,
      uploadCount: 1,
      uploadedBytes: 400,
    });
    expect(queue.hasWork()).toBe(false);
  });

  it("keeps incomplete work queued", () => {
    const queue = new RetainedTextureWorkQueue();
    queue.enqueue({
      contentVersion: 1,
      kind: "content-rect",
      sourceRect: { height: 10, width: 10, x: 0, y: 0 },
      surfaceId: "surface-a",
    });

    const result = runRetainedTextureUploadScheduler({
      budget: DEFAULT_BUDGET,
      estimateWorkItem: () => SMALL_WORK,
      executeWorkItem: () => ({ ...SMALL_WORK, complete: false }),
      queue,
    });

    expect(result.budgetExhausted).toBe(true);
    expect(result.remainingUploadableWorkCount).toBe(1);
    expect(queue.hasWork()).toBe(true);
  });

  it("skips work that would exceed the remaining byte budget", () => {
    const queue = new RetainedTextureWorkQueue();
    queue.enqueue({
      contentVersion: 1,
      kind: "content-rect",
      sourceRect: { height: 10, width: 10, x: 0, y: 0 },
      surfaceId: "surface-a",
    });
    queue.enqueue({
      contentVersion: 1,
      kind: "content-rect",
      sourceRect: { height: 10, width: 10, x: 0, y: 20 },
      surfaceId: "surface-b",
    });

    const result = runRetainedTextureUploadScheduler({
      budget: { ...DEFAULT_BUDGET, maxFrameUploadedBytes: 600 },
      estimateWorkItem: () => SMALL_WORK,
      executeWorkItem: () => ({ ...SMALL_WORK, complete: true }),
      queue,
    });

    expect(result.executedItems.map((item) => item.surfaceId)).toEqual([
      "surface-a",
    ]);
    expect(result.skippedItems.map((item) => item.surfaceId)).toEqual([
      "surface-b",
    ]);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      reason: "budget-exhausted",
      queue: "visible",
    });
    expect(result.remainingUploadableWorkCount).toBe(1);
  });

  it("executes one visible upload when a single page exceeds the frame byte budget", () => {
    const queue = new RetainedTextureWorkQueue();
    queue.enqueue({
      contentVersion: 1,
      kind: "first-visible",
      sourceRect: { height: 10, width: 10, x: 0, y: 0 },
      surfaceId: "surface-a",
    });

    const oversizedWork: RetainedTextureUploadWorkEstimate = {
      rasterMs: 1,
      uploadCount: 1,
      uploadedBytes: 2_000,
      uploadMs: 1,
    };
    const result = runRetainedTextureUploadScheduler({
      budget: { ...DEFAULT_BUDGET, maxFrameUploadedBytes: 1_000 },
      estimateWorkItem: () => oversizedWork,
      executeWorkItem: () => ({ ...oversizedWork, complete: true }),
      queue,
    });

    expect(result.executedItems.map((item) => item.surfaceId)).toEqual([
      "surface-a",
    ]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ reason: "actual-budget-miss" }),
    ]);
    expect(queue.hasWork()).toBe(false);
  });

  it("does not run visible LOD refinement during viewport interaction", () => {
    const queue = new RetainedTextureWorkQueue();
    queue.enqueue({
      contentVersion: 1,
      kind: "lod-refinement",
      sourceRect: { height: 10, width: 10, x: 0, y: 0 },
      surfaceId: "surface-a",
      targetLod: 2,
    });

    const result = runRetainedTextureUploadScheduler({
      budget: DEFAULT_BUDGET,
      estimateWorkItem: () => SMALL_WORK,
      executeWorkItem: () => ({ ...SMALL_WORK, complete: true }),
      queue,
      viewportInteractionActive: true,
    });

    expect(result.executedItems).toEqual([]);
    expect(result.budgetExhausted).toBe(false);
    expect(queue.hasWork()).toBe(true);
  });

  it("allows interactive work during viewport interaction", () => {
    const queue = new RetainedTextureWorkQueue();
    queue.enqueue({
      contentVersion: 1,
      kind: "animation-rect",
      priority: "interactive",
      sourceRect: { height: 10, width: 10, x: 0, y: 0 },
      surfaceId: "surface-a",
    });

    const result = runRetainedTextureUploadScheduler({
      budget: DEFAULT_BUDGET,
      estimateWorkItem: () => SMALL_WORK,
      executeWorkItem: () => ({ ...SMALL_WORK, complete: true }),
      queue,
      viewportInteractionActive: true,
    });

    expect(result.executedItems.map((item) => item.surfaceId)).toEqual([
      "surface-a",
    ]);
    expect(queue.hasWork()).toBe(false);
  });

  it("allows first-visible work during viewport interaction", () => {
    const queue = new RetainedTextureWorkQueue();
    queue.enqueue({
      contentVersion: 1,
      kind: "first-visible",
      sourceRect: { height: 10, width: 10, x: 0, y: 0 },
      surfaceId: "surface-a",
    });

    const result = runRetainedTextureUploadScheduler({
      budget: DEFAULT_BUDGET,
      estimateWorkItem: () => SMALL_WORK,
      executeWorkItem: () => ({ ...SMALL_WORK, complete: true }),
      queue,
      viewportInteractionActive: true,
    });

    expect(result.executedItems.map((item) => item.surfaceId)).toEqual([
      "surface-a",
    ]);
    expect(queue.hasWork()).toBe(false);
  });
});

describe("retainedTextureSchedulerQueueForWorkItem", () => {
  it("maps work item priority to scheduler queues", () => {
    expect(
      retainedTextureSchedulerQueueForWorkItem({
        kind: "content-rect",
        priority: "interactive",
      }),
    ).toBe("interactive");
    expect(
      retainedTextureSchedulerQueueForWorkItem({
        kind: "content-rect",
        priority: "visible",
      }),
    ).toBe("visible");
    expect(
      retainedTextureSchedulerQueueForWorkItem({
        kind: "content-rect",
        priority: "prefetch",
      }),
    ).toBe("prefetch");
  });
});

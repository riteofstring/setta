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
    expect(result.executedItems[0]).toMatchObject({
      actual: SMALL_WORK,
      estimate: SMALL_WORK,
      lane: "visible-repair",
      queue: "visible",
      surfaceId: "surface-a",
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

  it("keeps visible LOD refinement queued during viewport interaction", () => {
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

  it("does not report active-motion refinement as uploadable budget pressure", () => {
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
      pageWorkBudget: {
        refinementMaxBytes: 0,
      },
      queue,
      viewportInteractionActive: true,
    });

    expect(result.executedItems).toEqual([]);
    expect(result.skippedItems).toEqual([]);
    expect(result.diagnostics).toEqual([]);
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

  it("uses the visible repair reserve for multiple first-visible pages before refinement", () => {
    const queue = new RetainedTextureWorkQueue();
    for (let index = 0; index < 3; index += 1) {
      queue.enqueue({
        contentVersion: 1,
        kind: "first-visible",
        sourceRect: { height: 10, width: 10, x: 0, y: index * 12 },
        surfaceId: `visible-${index}`,
      });
    }
    queue.enqueue({
      contentVersion: 1,
      kind: "lod-refinement",
      sourceRect: { height: 10, width: 10, x: 0, y: 60 },
      surfaceId: "refinement",
      targetLod: 2,
    });

    const result = runRetainedTextureUploadScheduler({
      budget: { ...DEFAULT_BUDGET, maxUploads: 1 },
      estimateWorkItem: () => SMALL_WORK,
      executeWorkItem: () => ({ ...SMALL_WORK, complete: true }),
      pageWorkBudget: {
        refinementMaxBytes: 0,
        visibleCoverageReserveBytes: 2_000,
        visibleEdgeMaxUploads: 3,
      },
      queue,
      viewportInteractionActive: true,
    });

    expect(result.executedItems.map((item) => item.surfaceId)).toEqual([
      "visible-0",
      "visible-1",
      "visible-2",
    ]);
    expect(result.skippedItems).toEqual([]);
    expect(queue.hasWork()).toBe(true);
  });

  it("keeps offscreen prefetch work inside the explicit prefetch budget bucket", () => {
    const queue = new RetainedTextureWorkQueue();
    queue.enqueue({
      contentVersion: 1,
      kind: "source-window",
      priority: "prefetch",
      sourceWindow: { height: 100, width: 100, x: 0, y: 0 },
      surfaceId: "surface-a",
    });
    queue.enqueue({
      contentVersion: 1,
      kind: "source-window",
      priority: "prefetch",
      sourceWindow: { height: 100, width: 100, x: 0, y: 120 },
      surfaceId: "surface-b",
    });

    const result = runRetainedTextureUploadScheduler({
      budget: DEFAULT_BUDGET,
      estimateWorkItem: () => SMALL_WORK,
      executeWorkItem: () => ({ ...SMALL_WORK, complete: true }),
      queue,
      textureBudget: {
        activeIslandReserveBytes: 0,
        hardMaxBytes: DEFAULT_BUDGET.maxTextureMemoryBytes,
        nearViewportReserveBytes: 0,
        offscreenPrefetchMaxBytes: 600,
        visibleReserveBytes: 0,
      },
    });

    expect(result.executedItems.map((item) => item.surfaceId)).toEqual([
      "surface-a",
    ]);
    expect(result.skippedItems.map((item) => item.surfaceId)).toEqual([
      "surface-b",
    ]);
    expect(result.diagnostics[0]).toMatchObject({
      queue: "prefetch",
      reason: "deferred-frame-slice",
    });
  });

  it("reserves page work bytes for visible coverage before refinement and prefetch", () => {
    const queue = new RetainedTextureWorkQueue();
    queue.enqueue({
      contentVersion: 1,
      kind: "first-visible",
      sourceRect: { height: 10, width: 10, x: 0, y: 0 },
      surfaceId: "visible",
    });
    queue.enqueue({
      contentVersion: 1,
      kind: "lod-refinement",
      sourceRect: { height: 10, width: 10, x: 0, y: 20 },
      surfaceId: "refinement",
      targetLod: 2,
    });
    queue.enqueue({
      contentVersion: 1,
      kind: "source-window",
      priority: "prefetch",
      sourceWindow: { height: 100, width: 100, x: 0, y: 120 },
      surfaceId: "prefetch",
    });

    const result = runRetainedTextureUploadScheduler({
      budget: { ...DEFAULT_BUDGET, maxUploads: 3 },
      estimateWorkItem: () => SMALL_WORK,
      executeWorkItem: () => ({ ...SMALL_WORK, complete: true }),
      pageWorkBudget: {
        prefetchMaxBytes: 0,
        refinementMaxBytes: 0,
        visibleEdgeMaxUploads: 1,
      },
      queue,
    });

    expect(result.executedItems.map((item) => item.surfaceId)).toEqual([
      "visible",
    ]);
    expect(result.skippedItems.map((item) => item.surfaceId)).toEqual([
      "refinement",
      "prefetch",
    ]);
    expect(result.budgetExhausted).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.reason)).toEqual([
      "deferred-frame-slice",
      "deferred-frame-slice",
    ]);
  });

  it("reserves interaction time for visible true-hole repair before refinement", () => {
    const queue = new RetainedTextureWorkQueue();
    queue.enqueue({
      contentVersion: 1,
      kind: "first-visible",
      sourceRect: { height: 10, width: 10, x: 0, y: 0 },
      surfaceId: "visible",
    });
    queue.enqueue({
      contentVersion: 1,
      kind: "lod-refinement",
      sourceRect: { height: 10, width: 10, x: 0, y: 20 },
      surfaceId: "refinement",
      targetLod: 2,
    });

    const result = runRetainedTextureUploadScheduler({
      budget: { ...DEFAULT_BUDGET, maxUploads: 2 },
      estimateWorkItem: (item) =>
        item.kind === "first-visible"
          ? SMALL_WORK
          : { rasterMs: 3, uploadCount: 1, uploadedBytes: 400, uploadMs: 3 },
      executeWorkItem: (item) =>
        item.kind === "first-visible"
          ? { ...SMALL_WORK, complete: true }
          : {
              complete: true,
              rasterMs: 3,
              uploadCount: 1,
              uploadedBytes: 400,
              uploadMs: 3,
            },
      pageWorkBudget: {
        interactionFrameMaxMs: 2,
        refinementMaxBytes: 1_000,
        visibleEdgeMaxUploads: 1,
      },
      queue,
      viewportInteractionActive: true,
    });

    expect(result.executedItems.map((item) => item.surfaceId)).toEqual([
      "visible",
    ]);
    expect(result.skippedItems).toEqual([]);
    expect(queue.hasWork()).toBe(true);
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

import { describe, expect, it } from "vitest";

import { RetainedTextureWorkQueue } from "./retainedTextureWorkQueue";

describe("RetainedTextureWorkQueue", () => {
  it("coalesces matching rect work by union without losing the source rect", () => {
    const queue = new RetainedTextureWorkQueue();

    queue.enqueue({
      contentVersion: 3,
      kind: "content-rect",
      sourceRect: { height: 20, width: 30, x: 10, y: 10 },
      sourceWindow: { height: 200, width: 100, x: 0, y: 0 },
      surfaceId: "surface",
    });
    queue.enqueue({
      contentVersion: 3,
      kind: "content-rect",
      priority: "interactive",
      sourceRect: { height: 12, width: 40, x: 25, y: 24 },
      sourceWindow: { height: 200, width: 100, x: 0, y: 0 },
      surfaceId: "surface",
    });

    expect(queue.orderedWorkItems()).toEqual([
      expect.objectContaining({
        priority: "interactive",
        sourceRect: { height: 26, width: 55, x: 10, y: 10 },
      }),
    ]);
  });

  it("keeps explicit full-content work separate from rect work", () => {
    const queue = new RetainedTextureWorkQueue();

    queue.enqueue({
      contentVersion: 1,
      kind: "content-rect",
      sourceRect: { height: 24, width: 50, x: 0, y: 24 },
      surfaceId: "surface",
    });
    queue.enqueue({
      contentVersion: 1,
      kind: "full-content",
      surfaceId: "surface",
    });

    const items = queue.orderedWorkItems();
    expect(items).toEqual([
      expect.objectContaining({
        kind: "content-rect",
        sourceRect: { height: 24, width: 50, x: 0, y: 24 },
      }),
      expect.objectContaining({
        kind: "full-content",
      }),
    ]);
    expect(items[1]).not.toHaveProperty("sourceRect");
  });

  it("rejects rect-scoped work without a source rect", () => {
    const queue = new RetainedTextureWorkQueue();

    expect(() =>
      queue.enqueue({
        contentVersion: 1,
        kind: "content-rect",
        surfaceId: "surface",
      }),
    ).toThrow("requires a sourceRect");
    expect(() =>
      queue.enqueue({
        contentVersion: 1,
        kind: "lod-refinement",
        surfaceId: "surface",
        targetLod: 2,
      }),
    ).toThrow("requires a sourceRect");
  });

  it("cancels LOD refinement without clearing content work", () => {
    const queue = new RetainedTextureWorkQueue();

    queue.enqueue({
      contentVersion: 1,
      kind: "content-rect",
      sourceRect: { height: 24, width: 50, x: 0, y: 24 },
      surfaceId: "surface",
    });
    queue.enqueue({
      contentVersion: 1,
      kind: "lod-refinement",
      sourceRect: { height: 128, width: 128, x: 0, y: 0 },
      surfaceId: "surface",
      targetLod: 4,
    });

    expect(queue.cancelLodRefinement()).toBe(1);
    expect(queue.orderedWorkItems()).toEqual([
      expect.objectContaining({ kind: "content-rect" }),
    ]);
  });

  it("filters passive refinement during active viewport interaction", () => {
    const queue = new RetainedTextureWorkQueue();

    queue.enqueue({
      contentVersion: 1,
      kind: "lod-refinement",
      sourceRect: { height: 128, width: 128, x: 0, y: 0 },
      surfaceId: "surface",
      targetLod: 4,
    });
    queue.enqueue({
      contentVersion: 1,
      kind: "source-window",
      priority: "prefetch",
      sourceWindow: { height: 256, width: 256, x: 0, y: 0 },
      surfaceId: "surface",
    });
    queue.enqueue({
      contentVersion: 1,
      kind: "content-rect",
      priority: "interactive",
      sourceRect: { height: 16, width: 16, x: 24, y: 24 },
      surfaceId: "surface",
    });

    expect(queue.orderedWorkItems({ viewportInteractionActive: true })).toEqual(
      [expect.objectContaining({ kind: "content-rect" })],
    );
    expect(queue.hasUploadableWork({ viewportInteractionActive: true })).toBe(
      true,
    );
  });
});

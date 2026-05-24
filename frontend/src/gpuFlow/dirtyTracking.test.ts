import { describe, expect, it } from "vitest";
import { DirtyNodeQueue } from "./dirtyTracking";

describe("DirtyNodeQueue", () => {
  it("orders critical nodes before interactive nodes, then content dirtiness and FIFO", () => {
    const queue = new DirtyNodeQueue();

    queue.markDirty({
      nodeId: "critical-resolution",
      priority: "critical",
      resolution: true,
    });
    queue.markDirty({
      nodeId: "visible-resolution",
      priority: "visible",
      resolution: true,
    });
    queue.markDirty({
      content: true,
      nodeId: "visible-content",
      priority: "visible",
    });
    queue.markDirty({
      nodeId: "prefetch-content",
      priority: "prefetch",
    });
    queue.markDirty({
      nodeId: "interactive-resolution",
      priority: "interactive",
      resolution: true,
    });

    expect(queue.orderedDirtyNodes().map((node) => node.nodeId)).toEqual([
      "critical-resolution",
      "interactive-resolution",
      "visible-content",
      "visible-resolution",
      "prefetch-content",
    ]);
  });

  it("merges dirtiness, reasons, frame, and priority for repeated marks", () => {
    const queue = new DirtyNodeQueue();

    queue.markDirty({
      frame: 1,
      nodeId: "node-a",
      priority: "visible",
      reason: "paint",
    });
    const state = queue.markDirty({
      frame: 7,
      nodeId: "node-a",
      priority: "interactive",
      reason: "resolution",
      resolution: true,
    });

    expect(state).toMatchObject({
      dirtyContent: true,
      dirtyResolution: true,
      lastDirtyFrame: 7,
      nodeId: "node-a",
      priority: "interactive",
    });
    expect(state.reasons).toEqual(["paint", "resolution"]);
    expect(state.workKinds).toEqual(["content", "resolution"]);
  });

  it("classifies dirty work by explicit reason", () => {
    const queue = new DirtyNodeQueue();

    queue.markDirty({
      frame: 1,
      nodeId: "node-a",
      reason: "pointer",
    });
    queue.markDirty({
      frame: 2,
      nodeId: "node-a",
      reason: "animation",
    });
    const state = queue.markDirty({
      content: true,
      frame: 3,
      nodeId: "node-a",
      reason: "scroll",
    });

    expect(state.workKinds).toEqual(["hover", "animation", "source-window"]);
  });

  it("preserves an existing source rect when later marks have no rect", () => {
    const queue = new DirtyNodeQueue();

    queue.markDirty({
      nodeId: "node-a",
      reason: "paint",
      sourceRect: { height: 20, width: 30, x: 10, y: 15 },
    });
    const state = queue.markDirty({
      nodeId: "node-a",
      reason: "content",
    });

    expect(state.sourceRect).toEqual({ height: 20, width: 30, x: 10, y: 15 });
  });

  it("coalesces repeated source rect dirtiness by union", () => {
    const queue = new DirtyNodeQueue();

    queue.markDirty({
      nodeId: "node-a",
      reason: "paint",
      sourceRect: { height: 20, width: 30, x: 10, y: 15 },
    });
    const state = queue.markDirty({
      nodeId: "node-a",
      reason: "animation",
      sourceRect: { height: 5, width: 50, x: 30, y: 5 },
    });

    expect(state.sourceRect).toEqual({ height: 30, width: 70, x: 10, y: 5 });
  });

  it("allows explicit priority demotion without clearing dirtiness", () => {
    const queue = new DirtyNodeQueue();

    queue.markDirty({
      nodeId: "node-a",
      priority: "interactive",
    });
    queue.setPriority("node-a", "visible");

    expect(queue.get("node-a")).toMatchObject({
      dirtyContent: true,
      nodeId: "node-a",
      priority: "visible",
    });
  });
});

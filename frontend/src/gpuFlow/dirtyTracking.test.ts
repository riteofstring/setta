import { describe, expect, it } from "vitest";
import { DirtyNodeQueue } from "./dirtyTracking";

describe("DirtyNodeQueue", () => {
  it("orders interactive nodes first, then content dirtiness, then FIFO", () => {
    const queue = new DirtyNodeQueue();

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

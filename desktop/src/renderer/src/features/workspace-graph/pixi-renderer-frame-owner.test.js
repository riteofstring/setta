import { describe, expect, test } from "vitest";

import { createWorkflowGraphFrameOwner } from "./pixi-renderer-frame-owner";

describe("workflow graph frame owner", () => {
  test("coalesces frame requests and renders once on the admitted frame", () => {
    const frames = [];
    const rendered = [];
    const scheduler = manualFrameScheduler();
    const owner = createWorkflowGraphFrameOwner({
      app: {
        render: () => rendered.push("render"),
      },
      cancelFrame: scheduler.cancelFrame,
      onFrame: (now) => frames.push(now),
      requestFrame: scheduler.requestFrame,
    });

    expect(owner.request("wheel-pan")).toBe(true);
    expect(owner.request("wheel-zoom")).toBe(false);
    scheduler.flushFrame(123);

    expect(frames).toEqual([123]);
    expect(rendered).toEqual(["render"]);
    expect(owner.debugSnapshot()).toMatchObject({
      frameOwnerFrameCount: 1,
      frameOwnerLastFrameReason: "wheel-zoom",
      frameOwnerRenderCount: 1,
      frameOwnerRequestCount: 1,
      frameOwnerScheduled: false,
    });
  });

  test("cancels scheduled callbacks on suspend and counts stale callbacks", () => {
    const scheduler = manualFrameScheduler();
    const rendered = [];
    const frames = [];
    const owner = createWorkflowGraphFrameOwner({
      app: {
        render: () => rendered.push("render"),
      },
      cancelFrame: scheduler.cancelFrame,
      onFrame: (now) => frames.push(now),
      requestFrame: scheduler.requestFrame,
    });

    owner.start("activate");
    owner.suspend("debug-capture");
    scheduler.flushCanceledFrame(456);

    expect(owner.debugSnapshot()).toMatchObject({
      frameOwnerCancelCount: 1,
      frameOwnerHeld: true,
      frameOwnerRenderCount: 0,
      frameOwnerStaleFrameCount: 1,
    });

    owner.release("resume");
    scheduler.flushFrame(789);

    expect(owner.debugSnapshot()).toMatchObject({
      frameOwnerFrameCount: 1,
      frameOwnerHeld: false,
      frameOwnerRenderCount: 1,
    });
    expect(frames).toEqual([789]);
    expect(rendered).toEqual(["render"]);
  });
});

function manualFrameScheduler() {
  let nextId = 1;
  const frames = new Map();
  const canceled = new Map();
  return {
    cancelFrame(id) {
      const callback = frames.get(id);
      frames.delete(id);
      if (callback) {
        canceled.set(id, callback);
      }
    },
    flushCanceledFrame(now) {
      const [id, callback] = canceled.entries().next().value ?? [];
      if (id === undefined || !callback) {
        throw new Error("missing canceled frame");
      }
      canceled.delete(id);
      callback(now);
    },
    flushFrame(now) {
      const [id, callback] = frames.entries().next().value ?? [];
      if (id === undefined || !callback) {
        throw new Error("missing frame");
      }
      frames.delete(id);
      callback(now);
    },
    requestFrame(callback) {
      const id = nextId;
      nextId += 1;
      frames.set(id, callback);
      return id;
    },
  };
}

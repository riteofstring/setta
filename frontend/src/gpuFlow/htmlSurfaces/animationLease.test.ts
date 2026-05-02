/* @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { createHtmlSurfaceAnimationCaptureLeaseController } from "./animationLease";

describe("HTML surface animation capture leases", () => {
  it("marks only the animated surface dirty until the settled frame is captured", () => {
    const element = document.createElement("div");
    let animationRunning = true;
    element.getAnimations = vi.fn(() =>
      animationRunning
        ? ([{ playbackState: "running" }] as unknown as Animation[])
        : ([] as Animation[]),
    );
    const markDirty = vi.fn(() => true);
    const clock = createAnimationClock();
    const controller = createHtmlSurfaceAnimationCaptureLeaseController({
      cancelAnimationFrame: clock.cancelAnimationFrame,
      getSourceElement: (surfaceId) =>
        surfaceId === "node-a" ? element : null,
      markDirty,
      now: clock.now,
      requestAnimationFrame: clock.requestAnimationFrame,
    });

    controller.begin({ surfaceId: "node-a", target: element });
    clock.flushNextFrame();
    animationRunning = false;
    controller.settle({ surfaceId: "node-a", target: element });
    clock.flushNextFrame();

    expect(markDirty).toHaveBeenCalledTimes(4);
    expect(markDirty).toHaveBeenNthCalledWith(1, {
      reason: "animation",
      surfaceId: "node-a",
    });
    expect(markDirty).toHaveBeenNthCalledWith(4, {
      reason: "animation",
      surfaceId: "node-a",
    });
    expect(controller.hasActiveLease("node-a")).toBe(false);
    expect(clock.pendingFrameCount()).toBe(0);
  });

  it("stops a source-owned animation lease at the explicit frame budget", () => {
    const element = document.createElement("div");
    element.getAnimations = vi.fn(
      () => [{ playbackState: "running" }] as unknown as Animation[],
    );
    const markDirty = vi.fn(() => true);
    const clock = createAnimationClock();
    const controller = createHtmlSurfaceAnimationCaptureLeaseController({
      cancelAnimationFrame: clock.cancelAnimationFrame,
      getSourceElement: () => element,
      markDirty,
      maxFrames: 2,
      now: clock.now,
      requestAnimationFrame: clock.requestAnimationFrame,
    });

    controller.begin({ surfaceId: "node-a", target: element });
    clock.flushNextFrame();
    clock.flushNextFrame();

    expect(markDirty).toHaveBeenCalledTimes(2);
    expect(controller.hasActiveLease("node-a")).toBe(false);
  });
});

function createAnimationClock() {
  let nowMs = 0;
  let nextFrameId = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  return {
    cancelAnimationFrame: vi.fn((frameId: number) => {
      callbacks.delete(frameId);
    }),
    flushNextFrame() {
      const [frameId, callback] = callbacks.entries().next().value ?? [];
      if (!frameId || !callback) {
        throw new Error("Expected a pending animation frame.");
      }
      callbacks.delete(frameId);
      nowMs += 16;
      callback(nowMs);
    },
    now: () => nowMs,
    pendingFrameCount: () => callbacks.size,
    requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
      const frameId = nextFrameId;
      nextFrameId += 1;
      callbacks.set(frameId, callback);
      return frameId;
    }),
  };
}

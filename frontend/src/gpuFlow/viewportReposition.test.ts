/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import { subscribeToGpuViewportReposition } from "./viewportReposition";
import { createGpuFlowViewportStore } from "./viewportStore";

describe("gpu viewport reposition subscriptions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("dispatches reposition signals initially and after viewport changes", () => {
    const store = createGpuFlowViewportStore();
    const frameCallbacks: FrameRequestCallback[] = [];
    const requestAnimationFrameSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        frameCallbacks.push(callback);
        return frameCallbacks.length;
      });
    const cancelAnimationFrameSpy = vi
      .spyOn(window, "cancelAnimationFrame")
      .mockImplementation(() => {});
    const onScroll = vi.fn();
    const onResize = vi.fn();
    window.addEventListener("scroll", onScroll);
    window.addEventListener("resize", onResize);

    const cleanup = subscribeToGpuViewportReposition(store);

    expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1);
    flushNextFrame(frameCallbacks);
    expect(onScroll).toHaveBeenCalledTimes(1);
    expect(onResize).toHaveBeenCalledTimes(1);

    store.getState().setTransform([10, 20, 2]);
    expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(2);
    flushNextFrame(frameCallbacks);
    expect(onScroll).toHaveBeenCalledTimes(2);
    expect(onResize).toHaveBeenCalledTimes(2);

    store.getState().setTransform([15, 20, 2]);
    cleanup();
    expect(cancelAnimationFrameSpy).toHaveBeenCalledTimes(1);

    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onResize);
  });
});

function flushNextFrame(frameCallbacks: FrameRequestCallback[]) {
  const callback = frameCallbacks.shift();
  if (!callback) {
    throw new Error("Expected a pending animation frame callback.");
  }
  callback(performance.now());
}

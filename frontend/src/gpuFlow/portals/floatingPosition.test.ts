/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";

import { gpuFlowViewportStore } from "../viewportStore";
import {
  autoUpdateGpuFloatingPosition,
  createGpuFloatingVirtualPointReference,
  createGpuFloatingVirtualRectReference,
  updateGpuFloatingPosition,
} from "./floatingPosition";

describe("GPU floating positioning", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    gpuFlowViewportStore.getState().setTransform([0, 0, 1]);
    vi.restoreAllMocks();
  });

  it("positions a floating element from a virtual retained rect", async () => {
    stubViewportSize({ height: 768, width: 1024 });
    const floating = document.createElement("div");
    document.body.append(floating);
    floating.getBoundingClientRect = () =>
      createRect({ height: 20, width: 50, x: 0, y: 0 });
    const onPosition = vi.fn();

    await updateGpuFloatingPosition({
      floating,
      matchReferenceWidth: true,
      offsetPx: 2,
      onPosition,
      placement: "bottom-start",
      reference: createGpuFloatingVirtualRectReference({
        height: 20,
        width: 120,
        x: 12,
        y: 34,
      }),
    });

    expect(onPosition).toHaveBeenCalledWith(
      expect.objectContaining({
        left: "12px",
        minWidth: "120px",
        opacity: 1,
        position: "fixed",
        top: "56px",
      }),
    );
  });

  it("refreshes placement on GPU viewport transforms", async () => {
    stubViewportSize({ height: 768, width: 1024 });
    const floating = document.createElement("div");
    document.body.append(floating);
    floating.getBoundingClientRect = () =>
      createRect({ height: 20, width: 50, x: 0, y: 0 });
    const onPosition = vi.fn();
    const frameCallbacks: FrameRequestCallback[] = [];
    const requestAnimationFrame = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        frameCallbacks.push(callback);
        return frameCallbacks.length;
      });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);

    const cleanup = autoUpdateGpuFloatingPosition({
      floating,
      onPosition,
      reference: createGpuFloatingVirtualPointReference({ x: 20, y: 30 }),
      repositionOnGpuViewportTransform: true,
    });
    flushNextFrame(frameCallbacks);
    await settleFloatingPosition();
    gpuFlowViewportStore.getState().setTransform([20, 10, 1.5]);
    flushNextFrame(frameCallbacks);
    await settleFloatingPosition();
    cleanup();

    expect(requestAnimationFrame).toHaveBeenCalled();
    expect(onPosition).toHaveBeenCalled();
  });
});

function stubViewportSize({
  height,
  width,
}: {
  readonly height: number;
  readonly width: number;
}) {
  Object.defineProperty(document.documentElement, "clientHeight", {
    configurable: true,
    value: height,
  });
  Object.defineProperty(document.documentElement, "clientWidth", {
    configurable: true,
    value: width,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: height,
  });
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
  });
}

async function settleFloatingPosition() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function flushNextFrame(frameCallbacks: FrameRequestCallback[]) {
  const callback = frameCallbacks.shift();
  if (!callback) {
    throw new Error("Expected a pending animation frame callback.");
  }
  callback(performance.now());
}

function createRect({
  height,
  width,
  x,
  y,
}: {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}): DOMRect {
  return {
    bottom: y + height,
    height,
    left: x,
    right: x + width,
    top: y,
    width,
    x,
    y,
    toJSON: () => ({}),
  };
}

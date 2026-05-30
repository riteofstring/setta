/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import { GpuFlowSupportError } from "./gpuDevice";
import {
  applyGpuCanvasSize,
  attachGpuCanvasResizeObserver,
  createGpuFrameScheduler,
  resolveGpuCanvasSizeFromEntry,
  type GpuCanvasSize,
} from "./gpuRenderer";

describe("createGpuFrameScheduler", () => {
  it("coalesces multiple frame requests into one callback", () => {
    const callbacks: FrameRequestCallback[] = [];
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return callbacks.length;
    });
    const cancelAnimationFrame = vi.fn();
    const onFrame = vi.fn();

    const scheduler = createGpuFrameScheduler({
      cancelAnimationFrame,
      onFrame,
      requestAnimationFrame,
    });

    scheduler.requestFrame("resize");
    scheduler.requestFrame("paint");

    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
    const callback = callbacks[0];
    if (!callback) {
      throw new Error("expected scheduled frame callback");
    }
    callback(42);

    expect(onFrame).toHaveBeenCalledWith({
      reasons: ["resize", "paint"],
      timestamp: 42,
    });
    expect(scheduler.isFramePending()).toBe(false);
  });

  it("cancels pending frames and clears queued reasons", () => {
    const callbacks: FrameRequestCallback[] = [];
    const cancelAnimationFrame = vi.fn();
    const onFrame = vi.fn();
    const scheduler = createGpuFrameScheduler({
      cancelAnimationFrame,
      onFrame,
      requestAnimationFrame: (callback) => {
        callbacks.push(callback);
        return 7;
      },
    });

    scheduler.requestFrame("viewport");
    scheduler.cancelFrame();
    scheduler.requestFrame("paint");

    expect(cancelAnimationFrame).toHaveBeenCalledWith(7);
    expect(callbacks).toHaveLength(2);
    const callback = callbacks[1];
    if (!callback) {
      throw new Error("expected rescheduled frame callback");
    }
    callback(88);

    expect(onFrame).toHaveBeenCalledWith({
      reasons: ["paint"],
      timestamp: 88,
    });
    expect(scheduler.isFramePending()).toBe(false);
  });
});

describe("GPU canvas sizing", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses device-pixel-content-box entries for canvas backing pixels", () => {
    const canvas = document.createElement("canvas");
    const onResize = vi.fn();
    let resizeCallback: ResizeObserverCallback = () => {
      throw new Error("resize callback was not installed");
    };
    const observe = vi.fn();
    const disconnect = vi.fn();

    class ResizeObserverMock {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
      }

      disconnect() {
        disconnect();
      }

      observe(target: Element, options?: ResizeObserverOptions) {
        observe(target, options);
      }

      unobserve() {}
    }

    const detach = attachGpuCanvasResizeObserver(canvas, onResize, {
      ResizeObserver: ResizeObserverMock as unknown as typeof ResizeObserver,
      devicePixelRatio: 2,
    });

    expect(observe).toHaveBeenCalledWith(canvas, {
      box: "device-pixel-content-box",
    });
    resizeCallback(
      [makeResizeEntry(canvas, 160, 90, 320, 180)],
      {} as ResizeObserver,
    );

    expect(canvas.width).toBe(320);
    expect(canvas.height).toBe(180);
    expect(onResize).toHaveBeenCalledWith({
      cssHeight: 90,
      cssWidth: 160,
      devicePixelRatio: 2,
      pixelHeight: 180,
      pixelWidth: 320,
    });

    detach();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("falls back to DPR when device-pixel-content-box data is absent", () => {
    const size = resolveGpuCanvasSizeFromEntry(
      makeResizeEntry(document.createElement("canvas"), 123.2, 45.1),
      2,
    );

    expect(size).toEqual({
      cssHeight: 45.1,
      cssWidth: 123.2,
      devicePixelRatio: 2,
      pixelHeight: 91,
      pixelWidth: 247,
    });
  });

  it("applies canvas backing dimensions only when they change", () => {
    const canvas = document.createElement("canvas");
    const size: GpuCanvasSize = {
      cssHeight: 50,
      cssWidth: 100,
      devicePixelRatio: 2,
      pixelHeight: 100,
      pixelWidth: 200,
    };

    expect(applyGpuCanvasSize(canvas, size)).toBe(true);
    expect(applyGpuCanvasSize(canvas, size)).toBe(false);
  });

  it("fails loudly when ResizeObserver is unavailable", () => {
    vi.stubGlobal("ResizeObserver", undefined);

    expect(() =>
      attachGpuCanvasResizeObserver(document.createElement("canvas"), vi.fn()),
    ).toThrow(GpuFlowSupportError);
  });
});

function makeResizeEntry(
  target: Element,
  cssWidth: number,
  cssHeight: number,
  pixelWidth?: number,
  pixelHeight?: number,
): ResizeObserverEntry {
  const entry = {
    contentRect: {
      height: cssHeight,
      width: cssWidth,
    },
    devicePixelContentBoxSize:
      pixelWidth === undefined || pixelHeight === undefined
        ? undefined
        : [
            {
              blockSize: pixelHeight,
              inlineSize: pixelWidth,
            },
          ],
    target,
  };
  return entry as unknown as ResizeObserverEntry;
}

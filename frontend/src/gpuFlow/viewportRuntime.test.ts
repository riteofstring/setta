import { afterEach, describe, expect, it, vi } from "vitest";
import { zoomBy } from "./viewportActions";
import { createGpuFlowViewportRuntime } from "./viewportRuntime";
import { registerGpuFlowViewportRuntime } from "./viewportRuntimeRegistry";
import { createGpuFlowViewportStore } from "./viewportStore";

describe("GpuFlow viewport runtime", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces pan input into one runtime frame before publishing public state", () => {
    const store = createGpuFlowViewportStore({
      transform: [0, 0, 1],
    });
    const requestFrame = vi.fn();
    const runtime = createGpuFlowViewportRuntime({ requestFrame, store });

    runtime.enqueuePan({ x: 4, y: -2 });
    runtime.enqueuePan({ x: 6, y: -3 });

    expect(store.getState().transform).toEqual([0, 0, 1]);
    expect(requestFrame).toHaveBeenCalledWith("viewport");

    const result = runtime.runFrame(16);

    expect(result).toEqual({ viewportChanged: true, viewportFrame: true });
    expect(runtime.getViewportTuple()).toEqual([10, -5, 1]);
    expect(store.getState().transform).toEqual([10, -5, 1]);

    runtime.destroy();
  });

  it("keeps public observer snapshots bounded during active input", () => {
    const store = createGpuFlowViewportStore({
      transform: [0, 0, 1],
    });
    const runtime = createGpuFlowViewportRuntime({
      observerPublishIntervalMs: 100,
      requestFrame: vi.fn(),
      store,
    });

    runtime.enqueuePan({ x: 10, y: 0 });
    runtime.runFrame(0);
    expect(store.getState().transform).toEqual([10, 0, 1]);

    runtime.enqueuePan({ x: 10, y: 0 });
    runtime.runFrame(50);
    expect(runtime.getViewportTuple()).toEqual([20, 0, 1]);
    expect(store.getState().transform).toEqual([10, 0, 1]);

    runtime.flushObserverSnapshot();
    expect(store.getState().transform).toEqual([20, 0, 1]);

    runtime.destroy();
  });

  it("routes viewport actions through the registered runtime live viewport", () => {
    const store = createGpuFlowViewportStore({
      height: 400,
      transform: [0, 0, 1],
      width: 600,
    });
    const runtime = createGpuFlowViewportRuntime({
      requestFrame: vi.fn(),
      store,
    });
    const unregister = registerGpuFlowViewportRuntime(store, runtime);

    runtime.enqueuePan({ x: 100, y: 0 });
    runtime.runFrame(0);
    runtime.enqueuePan({ x: 50, y: 0 });
    runtime.runFrame(50);
    expect(runtime.getViewportTuple()).toEqual([150, 0, 1]);
    expect(store.getState().transform).toEqual([100, 0, 1]);

    zoomBy(2, { point: { x: 0, y: 0 }, store });

    expect(runtime.getViewportTuple()).toEqual([300, 0, 2]);
    expect(store.getState().transform).toEqual([300, 0, 2]);

    unregister();
    runtime.destroy();
  });

  it("does not observe store updates before committed connection", () => {
    const store = createGpuFlowViewportStore({
      transform: [0, 0, 1],
    });
    const runtime = createGpuFlowViewportRuntime({
      requestFrame: vi.fn(),
      store,
    });

    store.getState().setTransform([20, 10, 2]);

    expect(runtime.getViewportTuple()).toEqual([0, 0, 1]);

    runtime.connectStore();

    expect(runtime.getViewportTuple()).toEqual([20, 10, 2]);

    runtime.destroy();
  });

  it("reactivates when a committed connection follows effect cleanup", () => {
    const store = createGpuFlowViewportStore({
      transform: [0, 0, 1],
    });
    const runtime = createGpuFlowViewportRuntime({
      requestFrame: vi.fn(),
      store,
    });

    runtime.destroy();
    runtime.connectStore();

    expect(runtime.applyViewportCommand([100, 0, 1], { durationMs: 100 })).toBe(
      true,
    );

    runtime.runFrame(0);
    runtime.runFrame(100);

    expect(runtime.getViewportTuple()).toEqual([100, 0, 1]);
    expect(store.getState().viewportAnimating).toBe(false);
    expect(store.getState().viewportInteractionActive).toBe(false);

    runtime.destroy();
  });

  it("clears runtime transition state when direct input interrupts animation", () => {
    const store = createGpuFlowViewportStore({
      transform: [0, 0, 1],
    });
    const runtime = createGpuFlowViewportRuntime({
      requestFrame: vi.fn(),
      store,
    });
    runtime.connectStore();

    runtime.applyViewportCommand([100, 0, 1], { durationMs: 100 });
    expect(store.getState().viewportAnimating).toBe(true);
    expect(store.getState().viewportInteractionActive).toBe(true);

    runtime.enqueuePan({ x: 8, y: 0 });
    expect(store.getState().viewportAnimating).toBe(false);
    runtime.runFrame(16);

    expect(runtime.getViewportTuple()).toEqual([8, 0, 1]);
    expect(store.getState().viewportInteractionActive).toBe(false);

    runtime.destroy();
  });

  it("clears runtime transition state when external store updates interrupt animation", () => {
    const store = createGpuFlowViewportStore({
      transform: [0, 0, 1],
    });
    const runtime = createGpuFlowViewportRuntime({
      requestFrame: vi.fn(),
      store,
    });
    runtime.connectStore();

    runtime.applyViewportCommand([100, 0, 1], { durationMs: 100 });
    expect(store.getState().viewportAnimating).toBe(true);

    store.getState().setTransform([20, 0, 1]);

    expect(runtime.getViewportTuple()).toEqual([20, 0, 1]);
    expect(store.getState().viewportAnimating).toBe(false);
    expect(store.getState().viewportInteractionActive).toBe(false);

    runtime.destroy();
  });

  it("settles runtime transitions if frame completion is interrupted", () => {
    vi.useFakeTimers();
    const store = createGpuFlowViewportStore({
      transform: [0, 0, 1],
    });
    const runtime = createGpuFlowViewportRuntime({
      requestFrame: vi.fn(),
      store,
    });

    runtime.applyViewportCommand([100, 20, 2], { durationMs: 100 });
    expect(store.getState().viewportAnimating).toBe(true);

    vi.advanceTimersByTime(150);

    expect(runtime.getViewportTuple()).toEqual([100, 20, 2]);
    expect(store.getState().transform).toEqual([100, 20, 2]);
    expect(store.getState().viewportAnimating).toBe(false);
    expect(store.getState().viewportInteractionActive).toBe(false);

    runtime.destroy();
  });
});

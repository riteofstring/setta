/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cancelViewportTransition,
  fitView,
  flowToScreenPosition,
  getViewport,
  getZoom,
  panBy,
  requestInitialFitView,
  resetZoom,
  screenToFlowPosition,
  setCenter,
  setInitialFitViewDone,
  setViewport,
  updateMapPosition,
  zoomAtScreenPoint,
  zoomBy,
  zoomTo,
} from "./viewportActions";
import { createGpuFlowViewportStore } from "./viewportStore";

describe("gpu viewport actions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("pans the Setta viewport transform in screen pixels", () => {
    const store = createGpuFlowViewportStore({
      transform: [10, 20, 2],
    });

    expect(panBy({ x: -3, y: 4 }, { store })).toBe(true);
    expect(store.getState().transform).toEqual([7, 24, 2]);
    expect(panBy({ x: 0, y: 0 }, { store })).toBe(false);
  });

  it("zooms around the requested screen point without moving its flow coordinate", () => {
    const store = createGpuFlowViewportStore({
      maxZoom: 4,
      minZoom: 0.25,
      transform: [0, 0, 1],
    });
    const point = { x: 100, y: 80 };
    const before = screenToFlowPosition(point, {
      ignoreDomNode: true,
      store,
    });

    expect(zoomAtScreenPoint(2, { point, store })).toBe(true);

    expect(store.getState().transform).toEqual([-100, -80, 2]);
    expect(screenToFlowPosition(point, { ignoreDomNode: true, store })).toEqual(
      before,
    );
  });

  it("sets center and reset zoom through store-owned dimensions", () => {
    const store = createGpuFlowViewportStore({
      defaultZoom: 0.75,
      height: 300,
      maxZoom: 4,
      minZoom: 0.25,
      transform: [0, 0, 1],
      width: 500,
    });

    expect(setCenter(25, 40, { store, zoom: 2 })).toBe(true);
    expect(store.getState().transform).toEqual([200, 70, 2]);
    expect(resetZoom({ duration: 0, store })).toBe(true);
    expect(store.getState().transform[2]).toBe(0.75);
  });

  it("exposes direct zoom aliases and viewport readers", () => {
    const store = createGpuFlowViewportStore({
      maxZoom: 4,
      minZoom: 0.25,
      transform: [10, 20, 1],
    });

    expect(zoomBy(2, { store })).toBe(true);
    expect(getZoom({ store })).toBe(2);
    expect(zoomTo(0.5, { store })).toBe(true);
    expect(getViewport({ store })).toEqual({ x: 5, y: 10, zoom: 0.5 });
  });

  it("fits bounds with the same center contract as the existing viewport", () => {
    const store = createGpuFlowViewportStore({
      height: 300,
      maxZoom: 4,
      minZoom: 0.25,
      width: 500,
    });

    expect(
      fitView({
        bounds: { height: 100, width: 200, x: 50, y: 25 },
        padding: 0,
        store,
      }),
    ).toBe(true);

    expect(store.getState().transform).toEqual([-125, -37.5, 2.5]);
  });

  it("caps initial fit-view zoom at the store default zoom", () => {
    const store = createGpuFlowViewportStore({
      defaultZoom: 1,
      height: 300,
      maxZoom: 4,
      minZoom: 0.25,
      width: 500,
    });

    expect(
      fitView({
        bounds: { height: 100, width: 200, x: 50, y: 25 },
        initial: true,
        maxZoom: 3,
        padding: 0,
        store,
      }),
    ).toBe(true);

    expect(store.getState().transform).toEqual([100, 75, 1]);
  });

  it("exposes initial fit-view lifecycle actions through the viewport owner", () => {
    const store = createGpuFlowViewportStore();
    const options = { nodes: [{ id: "section-a" }] };

    requestInitialFitView(options, { store });

    expect(store.getState().fitViewOnInit).toBe(true);
    expect(store.getState().fitViewOnInitDone).toBe(false);
    expect(store.getState().fitViewOnInitOptions).toBe(options);

    setInitialFitViewDone({ store });

    expect(store.getState().fitViewOnInit).toBe(false);
    expect(store.getState().fitViewOnInitDone).toBe(true);
    expect(store.getState().fitViewOnInitOptions).toBeUndefined();
  });

  it("converts through the registered DOM node before applying viewport math", () => {
    const store = createGpuFlowViewportStore({
      transform: [0, 0, 2],
    });
    const domNode = document.createElement("div");
    domNode.getBoundingClientRect = () =>
      ({
        bottom: 220,
        height: 200,
        left: 10,
        right: 310,
        top: 20,
        width: 300,
        x: 10,
        y: 20,
      }) as DOMRect;
    store.getState().setDomNode(domNode);

    expect(screenToFlowPosition({ x: 30, y: 50 }, { store })).toEqual({
      x: 10,
      y: 15,
    });
    expect(flowToScreenPosition({ x: 10, y: 15 }, { store })).toEqual({
      x: 20,
      y: 30,
    });
  });

  it("snaps screen points to a caller-provided flow grid when requested", () => {
    const store = createGpuFlowViewportStore({
      transform: [5, 10, 2],
    });

    expect(
      screenToFlowPosition(
        { x: 63, y: 91 },
        { ignoreDomNode: true, snapGrid: [10, 25], snapToGrid: true, store },
      ),
    ).toEqual({ x: 30, y: 50 });
    expect(() =>
      screenToFlowPosition(
        { x: 63, y: 91 },
        { ignoreDomNode: true, snapToGrid: true, store },
      ),
    ).toThrow("GPU flow snap grid is required");
  });

  it("keeps map position updates explicit", () => {
    const store = createGpuFlowViewportStore({
      transform: [10, 20, 1],
    });

    expect(updateMapPosition(12, { duration: 0, store })).toBe(true);
    expect(store.getState().transform).toEqual([22, 20, 1]);
  });

  it("animates reset zoom by default through the viewport owner", () => {
    const animation = installAnimationFrameController();
    const store = createGpuFlowViewportStore({
      defaultZoom: 1,
      height: 100,
      transform: [0, 0, 2],
      width: 200,
    });

    expect(resetZoom({ store })).toBe(true);

    expect(store.getState().viewportAnimating).toBe(true);
    expect(store.getState().transform).toEqual([0, 0, 2]);

    animation.flushNextFrame(0);
    animation.flushNextFrame(100);

    expect(store.getState().transform).toEqual([50, 25, 1]);
    expect(store.getState().viewportAnimating).toBe(false);
  });

  it("animates map position shifts by default through the viewport owner", () => {
    const animation = installAnimationFrameController();
    const store = createGpuFlowViewportStore({
      transform: [10, 20, 1],
    });

    expect(updateMapPosition(12, { store })).toBe(true);

    expect(store.getState().viewportAnimating).toBe(true);
    expect(store.getState().transform).toEqual([10, 20, 1]);

    animation.flushNextFrame(0);
    animation.flushNextFrame(100);

    expect(store.getState().transform).toEqual([22, 20, 1]);
    expect(store.getState().viewportAnimating).toBe(false);
  });

  it("animates duration-based viewport changes through the store owner", () => {
    const animation = installAnimationFrameController();
    const store = createGpuFlowViewportStore({
      transform: [0, 0, 1],
    });

    expect(
      setViewport({ x: 100, y: 60, zoom: 2 }, { duration: 100, store }),
    ).toBe(true);
    expect(store.getState().viewportAnimating).toBe(true);
    expect(store.getState().viewportInteractionActive).toBe(true);
    expect(store.getState().transform).toEqual([0, 0, 1]);

    animation.flushNextFrame(0);
    expect(store.getState().transform).toEqual([0, 0, 1]);

    animation.flushNextFrame(50);
    expect(store.getState().transform).toEqual([50, 30, 1.5]);
    expect(store.getState().viewportAnimating).toBe(true);

    animation.flushNextFrame(100);
    expect(store.getState().transform).toEqual([100, 60, 2]);
    expect(store.getState().viewportAnimating).toBe(false);
    expect(store.getState().viewportInteractionActive).toBe(false);
  });

  it("cancels an animated viewport transition when an immediate viewport action takes ownership", () => {
    const animation = installAnimationFrameController();
    const store = createGpuFlowViewportStore({
      transform: [0, 0, 1],
    });

    expect(setViewport({ x: 100 }, { duration: 100, store })).toBe(true);

    expect(panBy({ x: 5, y: 6 }, { store })).toBe(true);

    expect(store.getState().transform).toEqual([5, 6, 1]);
    expect(store.getState().viewportAnimating).toBe(false);
    expect(store.getState().viewportInteractionActive).toBe(false);
    expect(animation.pendingFrameCount()).toBe(0);
  });

  it("cancels an animated viewport transition when a direct interaction starts", () => {
    const animation = installAnimationFrameController();
    const store = createGpuFlowViewportStore({
      transform: [0, 0, 1],
    });

    expect(zoomTo(2, { duration: 100, store })).toBe(true);

    store.getState().setViewportInteractionFlags({ nodeDragging: true });

    expect(store.getState().transform).toEqual([0, 0, 1]);
    expect(store.getState().viewportAnimating).toBe(false);
    expect(store.getState().viewportInteractionActive).toBe(true);
    expect(animation.pendingFrameCount()).toBe(0);

    store.getState().setViewportInteractionFlags({ nodeDragging: false });
  });

  it("allows callers to explicitly cancel an animated viewport transition", () => {
    const animation = installAnimationFrameController();
    const store = createGpuFlowViewportStore({
      transform: [0, 0, 1],
    });

    expect(resetZoom({ duration: 100, store })).toBe(false);
    expect(setViewport({ zoom: 2 }, { duration: 100, store })).toBe(true);
    expect(cancelViewportTransition({ store })).toBe(true);
    expect(cancelViewportTransition({ store })).toBe(false);
    expect(store.getState().viewportAnimating).toBe(false);
    expect(animation.pendingFrameCount()).toBe(0);
  });

  it("rejects invalid viewport transition durations loudly", () => {
    const store = createGpuFlowViewportStore();

    expect(() => setViewport({ x: 1 }, { duration: -1, store })).toThrow(
      "viewport transition duration must be a finite non-negative number",
    );
  });
});

function installAnimationFrameController() {
  let nextFrameId = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const frameId = nextFrameId;
    nextFrameId += 1;
    callbacks.set(frameId, callback);
    return frameId;
  });
  vi.stubGlobal("cancelAnimationFrame", (frameId: number) => {
    callbacks.delete(frameId);
  });
  return {
    flushNextFrame(timestampMs: number) {
      const [frameId, callback] = callbacks.entries().next().value ?? [];
      if (!frameId || !callback) {
        throw new Error("No animation frame is pending.");
      }
      callbacks.delete(frameId);
      callback(timestampMs);
    },
    pendingFrameCount() {
      return callbacks.size;
    },
  };
}

/* @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import {
  fitView,
  flowToScreenPosition,
  getViewport,
  getZoom,
  panBy,
  resetZoom,
  screenToFlowPosition,
  setCenter,
  setViewport,
  updateMapPosition,
  zoomAtScreenPoint,
  zoomBy,
  zoomTo,
} from "./viewportActions";
import { createGpuFlowViewportStore } from "./viewportStore";

describe("gpu viewport actions", () => {
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
    expect(resetZoom({ store })).toBe(true);
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

  it("keeps map position updates explicit and rejects unimplemented transitions", () => {
    const store = createGpuFlowViewportStore({
      transform: [10, 20, 1],
    });

    expect(updateMapPosition(12, { store })).toBe(true);
    expect(store.getState().transform).toEqual([22, 20, 1]);
    expect(() => setViewport({ x: 1 }, { duration: 100, store })).toThrow(
      "GPU flow viewport transitions are not implemented",
    );
  });
});

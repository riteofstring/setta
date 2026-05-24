/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getPaneRect,
  getSectionBounds,
  getSectionRect,
  movePaneToIncludeSection,
} from "./flowGeometry";
import { gpuFlowLayoutStore } from "./layoutStore";
import { gpuFlowViewportStore } from "./viewportStore";

function resetGpuViewport() {
  const state = gpuFlowViewportStore.getState();
  state.setDomNode(null);
  state.setTransform([0, 0, 1]);
  state.setViewportSize({ height: 0, width: 0 });
  state.setZoomBounds({ defaultZoom: 1, maxZoom: 4, minZoom: 0.1 });
}

describe("flowGeometry", () => {
  beforeEach(() => {
    gpuFlowLayoutStore.getState().replaceNodes([], { reason: "load" });
    resetGpuViewport();
  });

  it("uses GPU viewport store dimensions when deriving pane bounds", () => {
    const result = getPaneRect(
      {
        height: 100,
        transform: [10, 20, 2],
        width: 200,
      },
      50,
    );

    expect(result).toEqual({ height: 50, width: 100, x: 20, y: -10 });
  });

  it("does not read registered DOM node bounds for pane geometry", () => {
    const domNode = document.createElement("div");
    const getBoundingClientRect = vi.fn(() => ({
      bottom: 400,
      height: 400,
      left: 0,
      right: 500,
      top: 0,
      width: 500,
      x: 0,
      y: 0,
      toJSON: () => "",
    }));
    domNode.getBoundingClientRect = getBoundingClientRect;
    gpuFlowViewportStore.getState().setDomNode(domNode);

    const result = getPaneRect(
      {
        height: 400,
        transform: [10, 20, 2],
        width: 350,
      },
      50,
    );

    expect(result).toEqual({ height: 200, width: 175, x: 20, y: -10 });
    expect(getBoundingClientRect).not.toHaveBeenCalled();
  });

  it("reads section bounds from the renderer layout store", () => {
    gpuFlowLayoutStore.getState().replaceNodes([
      {
        height: 80,
        nodeId: "section-a",
        tempZIndex: 0,
        width: 120,
        x: 15,
        y: 20,
        zIndex: 0,
      },
    ]);

    expect(getSectionRect("section-a")).toEqual({
      height: 80,
      width: 120,
      x: 15,
      y: 20,
    });
  });

  it("uses renderer layout nodes for requested section bounds", () => {
    gpuFlowLayoutStore.getState().replaceNodes([
      {
        height: 80,
        nodeId: "section-a",
        tempZIndex: 0,
        width: 100,
        x: 10,
        y: 20,
        zIndex: 0,
      },
      {
        height: 90,
        nodeId: "section-b",
        tempZIndex: 0,
        width: 120,
        x: 180,
        y: 40,
        zIndex: 0,
      },
    ]);

    expect(getSectionBounds(["section-a", "section-b"])).toEqual({
      height: 110,
      width: 290,
      x: 10,
      y: 20,
    });
  });

  it("pans the GPU viewport to include a renderer layout section", () => {
    const state = gpuFlowViewportStore.getState();
    state.setTransform([0, 0, 2]);
    state.setViewportSize({ height: 400, width: 500 });
    gpuFlowLayoutStore.getState().replaceNodes([
      {
        height: 40,
        nodeId: "section-a",
        tempZIndex: 0,
        width: 80,
        x: 275,
        y: 100,
        zIndex: 0,
      },
    ]);

    movePaneToIncludeSection("section-a");

    expect(gpuFlowViewportStore.getState().transform).toEqual([-250, 0, 2]);
  });
});

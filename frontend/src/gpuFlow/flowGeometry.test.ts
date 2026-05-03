/* @vitest-environment jsdom */

import { setActiveSectionUIIds } from "state/activeSectionUI";
import { useLocalStorage } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { beforeEach, describe, expect, it } from "vitest";
import {
  getActiveSectionsBounds,
  getPaneRect,
  getSectionRect,
  movePaneToIncludeSection,
} from "./flowGeometry";
import { gpuFlowLayoutStore } from "./layoutStore";
import { gpuFlowViewportStore } from "./viewportStore";

function createElementWithRect(rect: {
  height: number;
  width: number;
  x: number;
  y: number;
}) {
  const element = document.createElement("div");
  Object.defineProperty(element, "clientHeight", {
    configurable: true,
    get: () => rect.height,
  });
  Object.defineProperty(element, "clientWidth", {
    configurable: true,
    get: () => rect.width,
  });
  element.getBoundingClientRect = () =>
    ({
      bottom: rect.y + rect.height,
      height: rect.height,
      left: rect.x,
      right: rect.x + rect.width,
      top: rect.y,
      width: rect.width,
      x: rect.x,
      y: rect.y,
      toJSON: () => "",
    }) as DOMRect;
  return element;
}

function resetGpuViewport() {
  const state = gpuFlowViewportStore.getState();
  state.setDomNode(null);
  state.setTransform([0, 0, 1]);
  state.setViewportSize({ height: 0, width: 0 });
  state.setZoomBounds({ defaultZoom: 1, maxZoom: 4, minZoom: 0.1 });
}

describe("flowGeometry", () => {
  beforeEach(() => {
    resetProjectStores();
    gpuFlowLayoutStore.getState().replaceNodes([], { reason: "load" });
    resetGpuViewport();
    useLocalStorage.setState({
      overviewTrueWidth: 0,
      uiEditorTrueWidth: 0,
    });
  });

  it("uses transform math when deriving pane bounds without a DOM node", () => {
    const result = getPaneRect(
      {
        domNode: null,
        height: 100,
        transform: [10, 20, 2],
        width: 200,
      },
      50,
      75,
    );

    expect(result).toEqual({ height: 50, width: 100, x: 20, y: -10 });
  });

  it("derives visible pane bounds from the GPU viewport and DOM node width", () => {
    const domNode = createElementWithRect({
      height: 400,
      width: 500,
      x: 100,
      y: 200,
    });

    const result = getPaneRect(
      {
        domNode,
        height: 0,
        transform: [10, 20, 2],
        width: 0,
      },
      50,
      100,
    );

    expect(result).toEqual({ height: 200, width: 175, x: 20, y: -10 });
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

  it("uses renderer layout nodes for active section bounds", () => {
    setActiveSectionUIIds(["section-a", "section-b"]);
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

    expect(getActiveSectionsBounds()).toEqual({
      height: 110,
      width: 290,
      x: 10,
      y: 20,
    });
  });

  it("pans the GPU viewport to include a renderer layout section", () => {
    const pane = createElementWithRect({
      height: 400,
      width: 500,
      x: 0,
      y: 0,
    });
    const state = gpuFlowViewportStore.getState();
    state.setDomNode(pane);
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

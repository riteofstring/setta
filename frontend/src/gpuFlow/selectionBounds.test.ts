/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it } from "vitest";
import { gpuFlowLayoutStore } from "./layoutStore";
import {
  clearNodesSelectionBounds,
  shiftNodesSelectionBounds,
  updateNodesSelectionBoundsForSections,
} from "./selectionBounds";
import { createGpuFlowViewportStore } from "./viewportStore";

describe("selectionBounds", () => {
  beforeEach(() => {
    gpuFlowLayoutStore.getState().replaceNodes([], { reason: "load" });
  });

  it("updates GPU selection bounds from requested measured sections", () => {
    const store = createGpuFlowViewportStore();
    gpuFlowLayoutStore.getState().replaceNodes(
      [
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
      ],
      { reason: "project-sync" },
    );

    updateNodesSelectionBoundsForSections(["section-a", "section-b"], {
      store,
    });

    expect(store.getState().nodesSelectionBounds).toEqual({
      height: 110,
      width: 290,
      x: 10,
      y: 20,
    });
  });

  it("clears GPU selection bounds when no sections are selected", () => {
    const store = createGpuFlowViewportStore();
    store.getState().setNodesSelectionBounds({
      height: 40,
      width: 50,
      x: 10,
      y: 20,
    });

    updateNodesSelectionBoundsForSections([], { store });

    expect(store.getState().nodesSelectionBounds).toBeNull();
  });

  it("clears and shifts existing GPU selection bounds", () => {
    const store = createGpuFlowViewportStore();
    store.getState().setNodesSelectionBounds({
      height: 40,
      width: 50,
      x: 10,
      y: 20,
    });

    expect(shiftNodesSelectionBounds({ x: 3, y: -4 }, { store })).toBe(true);
    expect(store.getState().nodesSelectionBounds).toEqual({
      height: 40,
      width: 50,
      x: 13,
      y: 16,
    });

    clearNodesSelectionBounds({ store });

    expect(store.getState().nodesSelectionBounds).toBeNull();
    expect(shiftNodesSelectionBounds({ x: 1, y: 1 }, { store })).toBe(false);
  });
});

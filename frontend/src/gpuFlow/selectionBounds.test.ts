/* @vitest-environment jsdom */

import { setActiveSectionUIIds } from "state/activeSectionUI";
import { useNodeInternals } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearNodesSelectionBounds,
  shiftNodesSelectionBounds,
  updateActiveNodesSelectionBounds,
  updateNodesSelectionBoundsForSections,
} from "./selectionBounds";
import { createGpuFlowViewportStore } from "./viewportStore";

describe("selectionBounds", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  it("updates GPU selection bounds from active measured sections", () => {
    const store = createGpuFlowViewportStore();
    setActiveSectionUIIds(["section-a", "section-b"]);
    useNodeInternals.setState({
      x: new Map([
        [
          "section-a",
          {
            height: 80,
            id: "section-a",
            position: { x: 10, y: 20 },
            tempZIndex: 0,
            width: 100,
            zIndex: 0,
          },
        ],
        [
          "section-b",
          {
            height: 90,
            id: "section-b",
            position: { x: 180, y: 40 },
            tempZIndex: 0,
            width: 120,
            zIndex: 0,
          },
        ],
      ]),
    });

    updateActiveNodesSelectionBounds({ store });

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

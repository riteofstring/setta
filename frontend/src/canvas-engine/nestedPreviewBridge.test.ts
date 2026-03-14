/* @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { collectCanvasEngineNestedPreviewRects } from "./nestedPreviewBridge";

describe("nestedPreviewBridge", () => {
  it("measures nested section DOM into world-space preview rects", () => {
    const host = document.createElement("div");
    const domIsland = document.createElement("div");
    domIsland.dataset.canvasEngineDomIsland = "parent-a";

    const rootSection = document.createElement("section");
    rootSection.dataset.sectionId = "parent-a";
    const childSection = document.createElement("section");
    childSection.dataset.sectionId = "child-a";
    childSection.dataset.sectionActive = "true";

    domIsland.append(rootSection, childSection);
    host.appendChild(domIsland);

    setElementBounds(host, { left: 10, top: 20, width: 800, height: 600 });
    setElementBounds(rootSection, {
      left: 40,
      top: 60,
      width: 320,
      height: 220,
    });
    setElementBounds(childSection, {
      left: 70,
      top: 100,
      width: 180,
      height: 90,
    });

    const result = collectCanvasEngineNestedPreviewRects({
      hostElement: host as HTMLDivElement,
      camera: { x: 100, y: 200, zoom: 2 },
      knownTopLevelSectionIds: ["parent-a"],
      previousRectsByParentSectionId: new Map(),
      activeSectionIds: [],
    });

    expect(result.nestedPreviewRects).toEqual([
      {
        id: "child-a",
        parentSectionId: "parent-a",
        x: 130,
        y: 240,
        width: 90,
        height: 45,
        isActive: true,
        color: [0.28, 0.34, 0.44],
      },
    ]);
  });

  it("keeps the last measured preview rects for known parents when their dom island is unmounted", () => {
    const previousRects = new Map([
      [
        "parent-a",
        [
          {
            id: "child-a",
            parentSectionId: "parent-a",
            x: 10,
            y: 20,
            width: 30,
            height: 40,
            isActive: false,
            color: [0.15, 0.18, 0.22] as [number, number, number],
          },
        ],
      ],
    ]);

    const result = collectCanvasEngineNestedPreviewRects({
      hostElement: document.createElement("div") as HTMLDivElement,
      camera: { x: 0, y: 0, zoom: 1 },
      knownTopLevelSectionIds: ["parent-a"],
      previousRectsByParentSectionId: previousRects,
      activeSectionIds: [],
    });

    expect(result.nestedPreviewRects).toEqual(previousRects.get("parent-a"));
  });

  it("keeps the previous cache when the only remaining dom island is retained", () => {
    const host = document.createElement("div");
    const retainedIsland = document.createElement("div");
    retainedIsland.dataset.canvasEngineDomIsland = "parent-a";
    retainedIsland.dataset.canvasEngineDomIslandRetained = "true";
    host.appendChild(retainedIsland);

    const previousRects = new Map([
      [
        "parent-a",
        [
          {
            id: "child-a",
            parentSectionId: "parent-a",
            x: 10,
            y: 20,
            width: 30,
            height: 40,
            isActive: false,
            color: [0.15, 0.18, 0.22] as [number, number, number],
          },
        ],
      ],
    ]);

    const result = collectCanvasEngineNestedPreviewRects({
      hostElement: host as HTMLDivElement,
      camera: { x: 0, y: 0, zoom: 1 },
      knownTopLevelSectionIds: ["parent-a"],
      previousRectsByParentSectionId: previousRects,
      activeSectionIds: [],
    });

    expect(result.nestedPreviewRects).toEqual(previousRects.get("parent-a"));
  });

  it("drops preview rects when their top-level parent is no longer in the scene", () => {
    const previousRects = new Map([
      [
        "parent-a",
        [
          {
            id: "child-a",
            parentSectionId: "parent-a",
            x: 10,
            y: 20,
            width: 30,
            height: 40,
            isActive: false,
            color: [0.15, 0.18, 0.22] as [number, number, number],
          },
        ],
      ],
    ]);

    const result = collectCanvasEngineNestedPreviewRects({
      hostElement: null,
      camera: { x: 0, y: 0, zoom: 1 },
      knownTopLevelSectionIds: [],
      previousRectsByParentSectionId: previousRects,
      activeSectionIds: [],
    });

    expect(result.nestedPreviewRects).toEqual([]);
    expect(result.rectsByParentSectionId.size).toBe(0);
  });
});

function setElementBounds(
  element: Element,
  bounds: {
    left: number;
    top: number;
    width: number;
    height: number;
  },
) {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      x: bounds.left,
      y: bounds.top,
      left: bounds.left,
      top: bounds.top,
      width: bounds.width,
      height: bounds.height,
      right: bounds.left + bounds.width,
      bottom: bounds.top + bounds.height,
      toJSON: () => ({}),
    }),
  });
}

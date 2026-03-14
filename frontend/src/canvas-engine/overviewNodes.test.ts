import { describe, expect, it } from "vitest";
import { getCanvasEngineOverviewNodes } from "./overviewNodes";

describe("overviewNodes", () => {
  it("builds nodes for top-level sections and cached nested preview rects", () => {
    const nodes = getCanvasEngineOverviewNodes({
      topLevelSections: {
        "parent-a": {
          x: 100,
          y: 120,
          w: 320,
          h: 220,
          zIndex: 2,
        },
      },
      nestedPreviewRects: [
        {
          id: "child-a",
          parentSectionId: "parent-a",
          x: 140,
          y: 176,
          width: 180,
          height: 90,
          isActive: false,
          color: [0.15, 0.18, 0.22],
        },
      ],
    });

    expect(nodes).toEqual([
      {
        id: "parent-a",
        position: { x: 100, y: 120 },
        width: 320,
        height: 220,
        zIndex: 2,
        tempZIndex: 2,
        type: "default",
      },
      {
        id: "child-a",
        position: { x: 140, y: 176 },
        width: 180,
        height: 90,
        zIndex: 2.5,
        tempZIndex: 2.5,
        type: "canvas-engine-nested-preview",
        style: { background: "rgb(38 46 56)" },
      },
    ]);
  });

  it("does not duplicate a section id that already exists as a top-level node", () => {
    const nodes = getCanvasEngineOverviewNodes({
      topLevelSections: {
        "section-a": {
          x: 0,
          y: 0,
          w: 320,
          h: 200,
          zIndex: 0,
        },
      },
      nestedPreviewRects: [
        {
          id: "section-a",
          parentSectionId: "parent-a",
          x: 20,
          y: 20,
          width: 100,
          height: 50,
          isActive: false,
          color: [0.15, 0.18, 0.22],
        },
      ],
    });

    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.id).toBe("section-a");
  });
});

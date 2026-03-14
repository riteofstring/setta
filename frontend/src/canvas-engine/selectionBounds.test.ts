import { describe, expect, it } from "vitest";
import {
  getCanvasEngineKeyboardMoveDelta,
  getCanvasEngineTopLevelSelectionBounds,
} from "./selectionBounds";

describe("selectionBounds", () => {
  it("computes a bounding box across selected top-level sections", () => {
    expect(
      getCanvasEngineTopLevelSelectionBounds({
        activeSectionIds: ["section-a", "section-b"],
        topLevelSections: {
          "section-a": {
            x: 40,
            y: 60,
            zIndex: 0,
            w: 320,
            h: 180,
          },
          "section-b": {
            x: 420,
            y: 110,
            zIndex: 1,
            w: 360,
            h: 220,
          },
        },
      }),
    ).toEqual({
      x: 40,
      y: 60,
      width: 740,
      height: 270,
    });
  });

  it("returns null when no selected section is top-level", () => {
    expect(
      getCanvasEngineTopLevelSelectionBounds({
        activeSectionIds: ["nested-a"],
        topLevelSections: {},
      }),
    ).toBeNull();
  });

  it("uses snap-grid semantics for keyboard nudges", () => {
    expect(
      getCanvasEngineKeyboardMoveDelta({
        key: "ArrowRight",
        isShiftPressed: false,
        snapToGrid: false,
        snapGrid: [24, 36],
      }),
    ).toEqual({ x: 5, y: 0 });

    expect(
      getCanvasEngineKeyboardMoveDelta({
        key: "ArrowDown",
        isShiftPressed: true,
        snapToGrid: true,
        snapGrid: [24, 36],
      }),
    ).toEqual({ x: 0, y: 144 });

    expect(
      getCanvasEngineKeyboardMoveDelta({
        key: "Enter",
        isShiftPressed: false,
        snapToGrid: false,
        snapGrid: [24, 36],
      }),
    ).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  buildFloatingSnapResizeBounds,
  buildFloatingSnapResizeHandles,
  resolveFloatingSnapPresetFromBounds,
  type FloatingWindowBoundaryInsets,
} from "./projectChatSnapLayout";

const TEST_INSETS: FloatingWindowBoundaryInsets = {
  left: 40,
  right: 40,
  top: 40,
  bottom: 0,
};

describe("project chat snap layout helpers", () => {
  it("keeps edge-anchored quarter layouts classified as snapped after resizing", () => {
    // Custom quarter sizes should stay in snapped mode when they still hug the same edges.
    expect(
      resolveFloatingSnapPresetFromBounds(
        {
          x: 40,
          y: 40,
          width: 420,
          height: 300,
        },
        1440,
        900,
        TEST_INSETS,
      ),
    ).toBe("top_left");

    expect(
      resolveFloatingSnapPresetFromBounds(
        {
          x: 460,
          y: 340,
          width: 940,
          height: 560,
        },
        1440,
        900,
        TEST_INSETS,
      ),
    ).toBe("bottom_right");
  });

  it("builds shared vertical and horizontal resize handles for a quad snap layout", () => {
    // Four snapped windows should expose one unified vertical split and one unified horizontal split.
    const handles = buildFloatingSnapResizeHandles([
      {
        instanceId: "top-left",
        snapPreset: "top_left",
        bounds: {
          x: 40,
          y: 40,
          width: 480,
          height: 320,
        },
      },
      {
        instanceId: "top-right",
        snapPreset: "top_right",
        bounds: {
          x: 520,
          y: 40,
          width: 880,
          height: 320,
        },
      },
      {
        instanceId: "bottom-left",
        snapPreset: "bottom_left",
        bounds: {
          x: 40,
          y: 360,
          width: 480,
          height: 540,
        },
      },
      {
        instanceId: "bottom-right",
        snapPreset: "bottom_right",
        bounds: {
          x: 520,
          y: 360,
          width: 880,
          height: 540,
        },
      },
    ]);

    expect(handles).toHaveLength(2);
    expect(handles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          axis: "vertical",
          coordinate: 520,
          start: 40,
          end: 900,
          leadingInstanceIds: ["top-left", "bottom-left"],
          trailingInstanceIds: ["top-right", "bottom-right"],
        }),
        expect.objectContaining({
          axis: "horizontal",
          coordinate: 360,
          start: 40,
          end: 1400,
          leadingInstanceIds: ["top-left", "top-right"],
          trailingInstanceIds: ["bottom-left", "bottom-right"],
        }),
      ]),
    );
  });

  it("resizes both sides of a shared split without leaving the snapped tile layout", () => {
    // Moving a shared split should expand one side and contract the other using the same outer edges.
    expect(
      buildFloatingSnapResizeBounds(
        {
          axis: "vertical",
          coordinate: 520,
          leadingInstanceIds: ["top-left", "bottom-left"],
          trailingInstanceIds: ["top-right", "bottom-right"],
          startBoundsByInstanceId: {
            "top-left": {
              x: 40,
              y: 40,
              width: 480,
              height: 320,
            },
            "bottom-left": {
              x: 40,
              y: 360,
              width: 480,
              height: 540,
            },
            "top-right": {
              x: 520,
              y: 40,
              width: 880,
              height: 320,
            },
            "bottom-right": {
              x: 520,
              y: 360,
              width: 880,
              height: 540,
            },
          },
        },
        640,
      ),
    ).toEqual({
      "top-left": {
        x: 40,
        y: 40,
        width: 600,
        height: 320,
      },
      "bottom-left": {
        x: 40,
        y: 360,
        width: 600,
        height: 540,
      },
      "top-right": {
        x: 640,
        y: 40,
        width: 760,
        height: 320,
      },
      "bottom-right": {
        x: 640,
        y: 360,
        width: 760,
        height: 540,
      },
    });

    expect(
      buildFloatingSnapResizeBounds(
        {
          axis: "horizontal",
          coordinate: 360,
          leadingInstanceIds: ["top-left", "top-right"],
          trailingInstanceIds: ["bottom-left", "bottom-right"],
          startBoundsByInstanceId: {
            "top-left": {
              x: 40,
              y: 40,
              width: 600,
              height: 320,
            },
            "top-right": {
              x: 640,
              y: 40,
              width: 760,
              height: 320,
            },
            "bottom-left": {
              x: 40,
              y: 360,
              width: 600,
              height: 540,
            },
            "bottom-right": {
              x: 640,
              y: 360,
              width: 760,
              height: 540,
            },
          },
        },
        420,
      ),
    ).toEqual({
      "top-left": {
        x: 40,
        y: 40,
        width: 600,
        height: 380,
      },
      "top-right": {
        x: 640,
        y: 40,
        width: 760,
        height: 380,
      },
      "bottom-left": {
        x: 40,
        y: 420,
        width: 600,
        height: 480,
      },
      "bottom-right": {
        x: 640,
        y: 420,
        width: 760,
        height: 480,
      },
    });
  });
});

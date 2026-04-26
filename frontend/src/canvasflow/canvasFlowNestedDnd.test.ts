import { describe, expect, it } from "vitest";
import {
  getCanvasFlowNestedDndReorderIndex,
  resolveCanvasFlowNestedDndDropPlan,
  type CanvasFlowClientRect,
} from "./canvasFlowNestedDnd";

const TARGET_RECT: CanvasFlowClientRect = {
  bottom: 150,
  height: 100,
  left: 20,
  right: 220,
  top: 50,
  width: 200,
};

describe("canvasFlowNestedDnd", () => {
  it("resolves a reorder index before or after the target midpoint", () => {
    const children = ["a", "b", "c"];

    expect(
      getCanvasFlowNestedDndReorderIndex({
        children,
        pointerY: 70,
        sectionIds: ["c"],
        targetId: "a",
        targetRect: TARGET_RECT,
      }),
    ).toBe(0);

    expect(
      getCanvasFlowNestedDndReorderIndex({
        children,
        pointerY: 130,
        sectionIds: ["a"],
        targetId: "c",
        targetRect: TARGET_RECT,
      }),
    ).toBe(2);
  });

  it("keeps pane drops anchored to the dragged section top-left", () => {
    const plan = resolveCanvasFlowNestedDndDropPlan({
      dragEndPoint: { x: 300, y: 210 },
      dragStartPoint: { x: 120, y: 90 },
      draggingRectsById: {
        child: {
          bottom: 140,
          height: 80,
          left: 100,
          right: 260,
          top: 60,
          width: 160,
        },
      },
      sectionIds: ["child"],
      target: null,
      toWorldPosition: (position) => ({
        x: position.x / 2,
        y: position.y / 2,
      }),
    });

    expect(plan).toEqual({
      sectionIds: ["child"],
      newParentId: null,
      newIndex: 0,
      positionsById: {
        child: { x: 140, y: 90 },
      },
    });
  });
});

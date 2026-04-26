/* @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import {
  assignCanvasFlowNodePaintStyle,
  assignCanvasFlowNodeTransform,
  disableCulledCanvasFlowNodePointerEvents,
  getCanvasFlowNodeDomTransform,
} from "./canvasFlowDomTransform";

describe("canvasFlowDomTransform", () => {
  it("computes the direct node transform from world position and viewport", () => {
    expect(
      getCanvasFlowNodeDomTransform({
        node: { x: 100, y: 200 },
        viewport: { x: 40, y: 30, zoom: 0.1 },
      }),
    ).toBe("translate(50px, 50px) scale(0.1)");
  });

  it("assigns node transforms only when the style changes", () => {
    const element = document.createElement("div");
    const transform = "translate(10px, 20px) scale(0.5)";

    expect(assignCanvasFlowNodePaintStyle(element, transform)).toBe(true);
    expect(element.style.transform).toBe(transform);
    expect(element.style.pointerEvents).toBe("all");
    expect(assignCanvasFlowNodePaintStyle(element, transform)).toBe(false);
  });

  it("assigns visible transforms and disables pointer events for culled nodes", () => {
    const visible = document.createElement("div");
    const culled = document.createElement("div");
    visible.style.pointerEvents = "all";
    culled.style.pointerEvents = "all";
    assignCanvasFlowNodeTransform({
      element: visible,
      node: { x: 20, y: 30 },
      viewport: { x: 5, y: 7, zoom: 2 },
    });
    disableCulledCanvasFlowNodePointerEvents({
      nextInteractiveNodeIds: new Set(["visible"]),
      nodeElements: new Map([
        ["visible", visible],
        ["culled", culled],
      ]),
      previousInteractiveNodeIds: new Set(["visible", "culled"]),
    });

    expect(visible.style.transform).toBe("translate(45px, 67px) scale(2)");
    expect(visible.style.pointerEvents).toBe("all");
    expect(culled.style.pointerEvents).toBe("none");
  });
});

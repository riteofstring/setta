/* @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { getCanvasFlowNodeElement } from "./canvasFlowNodeElements";

describe("canvasFlowNodeElements", () => {
  it("resolves direct canvas child nodes and caches them in the element map", () => {
    const canvas = document.createElement("canvas");
    const node = document.createElement("div");
    const nodeElements = new Map<string, HTMLElement>();
    node.dataset.id = "node-1";
    canvas.appendChild(node);

    expect(
      getCanvasFlowNodeElement({ canvas, nodeElements, nodeId: "node-1" }),
    ).toBe(node);
    expect(nodeElements.get("node-1")).toBe(node);
  });
});

import { describe, expect, it } from "vitest";
import {
  getMountedNodeIds,
  getNodeDrawRecord,
  getNodeScreenDrawRect,
  getVisibleNodeDrawRecords,
  rectsOverlap,
} from "./canvasFlowGeometry";
import type { CanvasFlowNode } from "./canvasFlowTypes";

function node(
  id: string,
  x: number,
  y: number,
  width: number | null,
  height: number | null,
  zIndex = 0,
): CanvasFlowNode {
  return {
    id,
    position: { x, y },
    width,
    height,
    zIndex,
    tempZIndex: zIndex,
  };
}

describe("canvasFlowGeometry", () => {
  it("recognizes overlapping rects", () => {
    expect(
      rectsOverlap(
        { x: 0, y: 0, width: 100, height: 100 },
        { x: 99, y: 99, width: 10, height: 10 },
      ),
    ).toBe(true);
    expect(
      rectsOverlap(
        { x: 0, y: 0, width: 100, height: 100 },
        { x: 100, y: 100, width: 10, height: 10 },
      ),
    ).toBe(false);
  });

  it("rejects nodes without usable dimensions", () => {
    expect(getNodeDrawRecord(node("a", 0, 0, null, 10))).toBeNull();
    expect(getNodeDrawRecord(node("b", 0, 0, 10, 0))).toBeNull();
  });

  it("selects visible nodes in z order", () => {
    const nodes = [
      node("back", 0, 0, 100, 100, 1),
      node("outside", 500, 500, 100, 100, 0),
      node("front", 50, 50, 100, 100, 10),
    ];

    expect(
      getVisibleNodeDrawRecords({
        nodes,
        nodeElements: new Map(),
        visibleRect: { x: 25, y: 25, width: 150, height: 150 },
      }).map((record) => record.id),
    ).toEqual(["back", "front"]);
  });

  it("projects world node bounds into screen coordinates", () => {
    expect(
      getNodeScreenDrawRect(
        { x: 100, y: 200, width: 300, height: 400 },
        { x: 40, y: 30, zoom: 0.1 },
      ),
    ).toEqual({
      x: 50,
      y: 50,
      width: 30,
      height: 40,
    });
  });

  it("selects mounted nodes using fallback dimensions before measurement", () => {
    const nodes = [
      node("front", 0, 0, null, null, 5),
      node("back", 450, 0, null, null, 1),
      node("outside", 1000, 0, null, null, 0),
    ];

    expect(
      getMountedNodeIds({
        nodes,
        visibleRect: { x: 0, y: 0, width: 600, height: 200 },
      }),
    ).toEqual(["back", "front"]);
  });
});

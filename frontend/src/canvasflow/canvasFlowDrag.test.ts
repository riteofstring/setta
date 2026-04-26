import type { Node } from "forks/xyflow/core/types";
import { describe, expect, it } from "vitest";
import {
  getCanvasFlowDragItems,
  moveCanvasFlowDragItems,
  shouldShiftCanvasFlowSelection,
} from "./canvasFlowDrag";

function makeNode(id: string, x: number, y: number): Node {
  return {
    height: 50,
    id,
    position: { x, y },
    tempZIndex: 0,
    width: 100,
    zIndex: 0,
  };
}

describe("canvasFlowDrag", () => {
  it("drags the active selection when the grabbed node is selected", () => {
    const nodes = new Map([
      ["a", makeNode("a", 10, 20)],
      ["b", makeNode("b", 200, 40)],
      ["c", makeNode("c", 500, 80)],
    ]);
    const dragItems = getCanvasFlowDragItems({
      activeIds: ["a", "b"],
      nodeId: "a",
      nodes,
      pointer: { x: 30, y: 50 },
    });

    expect(dragItems.map((item) => item.id)).toEqual(["a", "b"]);
    expect(dragItems[0]?.distance).toEqual({ x: 20, y: 30 });
    expect(dragItems[1]?.distance).toEqual({ x: -170, y: 10 });
  });

  it("drags only the grabbed node when it is outside the selection", () => {
    const nodes = new Map([
      ["a", makeNode("a", 10, 20)],
      ["b", makeNode("b", 200, 40)],
    ]);
    const dragItems = getCanvasFlowDragItems({
      activeIds: ["a"],
      nodeId: "b",
      nodes,
      pointer: { x: 230, y: 80 },
    });

    expect(dragItems.map((item) => item.id)).toEqual(["b"]);
    expect(shouldShiftCanvasFlowSelection({ activeIds: ["a"], dragItems })).toBe(
      false,
    );
  });

  it("moves drag items by pointer distance and snaps only at drag end", () => {
    const [item] = getCanvasFlowDragItems({
      activeIds: ["a"],
      nodeId: "a",
      nodes: new Map([["a", makeNode("a", 10, 20)]]),
      pointer: { x: 30, y: 50 },
    });
    if (!item) {
      throw new Error("Expected drag item.");
    }

    const moved = moveCanvasFlowDragItems({
      dragItems: [item],
      pointer: { x: 47, y: 93 },
      snapGrid: [20, 20],
      snapToGrid: true,
    });
    const snapped = moveCanvasFlowDragItems({
      dragEnd: true,
      dragItems: moved.dragItems,
      pointer: { x: 47, y: 93 },
      snapGrid: [20, 20],
      snapToGrid: true,
    });

    expect(moved.dragItems[0]?.position).toEqual({ x: 27, y: 63 });
    expect(snapped.dragItems[0]?.position).toEqual({ x: 20, y: 60 });
  });

  it("shifts selection bounds only when all active ids are being dragged", () => {
    const dragItems = [
      {
        distance: { x: 0, y: 0 },
        id: "a",
        position: { x: 0, y: 0 },
      },
      {
        distance: { x: 0, y: 0 },
        id: "b",
        position: { x: 0, y: 0 },
      },
    ];

    expect(
      shouldShiftCanvasFlowSelection({
        activeIds: ["a", "b"],
        dragItems,
      }),
    ).toBe(true);
    expect(
      shouldShiftCanvasFlowSelection({
        activeIds: ["a", "b", "c"],
        dragItems,
      }),
    ).toBe(false);
  });
});

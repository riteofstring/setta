import { describe, expect, test } from "vitest";

import { interactionCancellationForGraphUpdate } from "./pixi-renderer-interaction-cancellation";

describe("interactionCancellationForGraphUpdate", () => {
  test("cancels edge drawing when the source node is removed", () => {
    expect(
      interactionCancellationForGraphUpdate(
        {
          activeTargetPortKey: "target:input",
          draggingNode: null,
          drawingEdge: drawingEdge("source"),
        },
        graph([node("target")]),
      ),
    ).toEqual({
      cancelDraggingNode: false,
      cancelDrawingEdge: true,
      clearActiveTargetPortKey: true,
      interactionCancelled: true,
    });
  });

  test("keeps edge drawing when the source port remains present", () => {
    expect(
      interactionCancellationForGraphUpdate(
        {
          activeTargetPortKey: "target:input",
          draggingNode: null,
          drawingEdge: drawingEdge("source"),
        },
        graph([node("source"), node("target")]),
      ),
    ).toEqual({
      cancelDraggingNode: false,
      cancelDrawingEdge: false,
      clearActiveTargetPortKey: false,
      interactionCancelled: false,
    });
  });

  test("cancels node dragging when one dragged node is removed", () => {
    expect(
      interactionCancellationForGraphUpdate(
        {
          activeTargetPortKey: null,
          draggingNode: draggingNode(["kept", "removed"]),
          drawingEdge: null,
        },
        graph([node("kept")]),
      ),
    ).toEqual({
      cancelDraggingNode: true,
      cancelDrawingEdge: false,
      clearActiveTargetPortKey: false,
      interactionCancelled: true,
    });
  });

  test("keeps node dragging when all dragged nodes remain present", () => {
    expect(
      interactionCancellationForGraphUpdate(
        {
          activeTargetPortKey: null,
          draggingNode: draggingNode(["kept", "also-kept"]),
          drawingEdge: null,
        },
        graph([node("kept"), node("also-kept")]),
      ),
    ).toEqual({
      cancelDraggingNode: false,
      cancelDrawingEdge: false,
      clearActiveTargetPortKey: false,
      interactionCancelled: false,
    });
  });

  test("clears the active target port when that port is removed", () => {
    expect(
      interactionCancellationForGraphUpdate(
        {
          activeTargetPortKey: "target:input",
          draggingNode: null,
          drawingEdge: null,
        },
        graph([node("target", { ports: [] })]),
      ),
    ).toEqual({
      cancelDraggingNode: false,
      cancelDrawingEdge: false,
      clearActiveTargetPortKey: true,
      interactionCancelled: false,
    });
  });
});

function drawingEdge(sourceNodeId) {
  return {
    endX: 0,
    endY: 0,
    sourceNodeId,
    sourcePortId: "output",
    startX: 0,
    startY: 0,
  };
}

function draggingNode(nodeIds) {
  return {
    moved: false,
    nodes: nodeIds.map((nodeId) => ({
      nodeId,
      originX: 0,
      originY: 0,
    })),
    startX: 0,
    startY: 0,
  };
}

function graph(nodes) {
  return {
    edges: [],
    nodes,
  };
}

function node(id, patch = {}) {
  return {
    color: 0x14b8a6,
    height: 82,
    id,
    label: id,
    width: 168,
    x: 0,
    y: 0,
    ...patch,
  };
}

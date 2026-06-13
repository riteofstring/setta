import { describe, expect, test } from "vitest";

import { redrawWorkspaceEdgeFlow, workflowEdgeFlowPhase } from "./pixi-renderer-edge-rendering";

describe("workspace graph edge flow rendering", () => {
  test("draws flow only for visible active workflow edges", () => {
    const edgeFlowGraphics = new RecordingGraphics();
    const nodes = new Map([
      ["source", workflowNode("source", 0, 0)],
      ["target", workflowNode("target", 220, 80)],
      ["hidden", workflowNode("hidden", 440, 80)],
      ["semantic", semanticNode("semantic", 0, 180)],
    ]);
    const accessedNodeIds = [];

    redrawWorkspaceEdgeFlow({
      edgeFlowGraphics,
      edges: [
        workflowEdge("active", "source", "target", "active"),
        workflowEdge("completed", "source", "target", "completed"),
        workflowEdge("hidden", "source", "hidden", "active"),
        {
          ...workflowEdge("semantic", "semantic", "target", "active"),
          layer: "semantic",
        },
      ],
      getNode: (nodeId) => {
        accessedNodeIds.push(nodeId);
        return nodes.get(nodeId);
      },
      now: 1200,
      visibleNodeIds: new Set(["source", "target", "semantic"]),
    });

    expect(accessedNodeIds).toEqual(["source", "target"]);
    expect(edgeFlowGraphics.operations[0]).toEqual(["clear"]);
    expect(edgeFlowGraphics.operations.some(([operation]) => operation === "lineTo")).toBe(true);
    expect(edgeFlowGraphics.operations.filter(([operation]) => operation === "fill")).toHaveLength(
      4,
    );
  });

  test("uses deterministic per-edge phases", () => {
    const first = workflowEdgeFlowPhase("edge:active");
    const second = workflowEdgeFlowPhase("edge:active");

    expect(second).toBe(first);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(1);
  });
});

function workflowNode(id, x, y) {
  return {
    height: 82,
    id,
    layer: "workflow",
    width: 168,
    x,
    y,
  };
}

function semanticNode(id, x, y) {
  return {
    ...workflowNode(id, x, y),
    connectable: false,
    layer: "semantic",
  };
}

function workflowEdge(id, sourceNodeId, targetNodeId, status) {
  return {
    id,
    layer: "workflow",
    sourceNodeId,
    sourcePortId: "output",
    status,
    targetNodeId,
    targetPortId: "input",
  };
}

class RecordingGraphics {
  constructor() {
    this.operations = [];
  }

  clear() {
    this.operations.push(["clear"]);
    return this;
  }

  moveTo(x, y) {
    this.operations.push(["moveTo", x, y]);
    return this;
  }

  lineTo(x, y) {
    this.operations.push(["lineTo", x, y]);
    return this;
  }

  stroke(style) {
    this.operations.push(["stroke", style]);
    return this;
  }

  circle(x, y, radius) {
    this.operations.push(["circle", x, y, radius]);
    return this;
  }

  fill(style) {
    this.operations.push(["fill", style]);
    return this;
  }
}

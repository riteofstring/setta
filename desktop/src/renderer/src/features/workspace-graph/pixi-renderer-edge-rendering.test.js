import { describe, expect, test } from "vitest";

import {
  redrawWorkspaceEdgeFlow,
  redrawWorkspaceEdges,
  workflowEdgeFlowPhase,
} from "./pixi-renderer-edge-rendering";
import { workspaceNeonTheme } from "./workspace-neon-theme";

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

  test("draws semantic edges as static colored tendrils", () => {
    const edgeGraphics = new RecordingGraphics();
    const color = workspaceNeonTheme.semantic.edgeKind.supports;
    const edgeLabelLayer = new RecordingLayer();
    const nodes = new Map([
      ["semantic:source", semanticNode("semantic:source", 0, 0)],
      ["semantic:target", semanticNode("semantic:target", 180, 70)],
    ]);

    redrawWorkspaceEdges({
      edgeGraphics,
      edgeLabelLayer,
      edges: [
        {
          alpha: 0.76,
          color,
          id: "semantic-edge:supports",
          layer: "semantic",
          sourceNodeId: "semantic:source",
          sourcePortId: "output",
          targetNodeId: "semantic:target",
          targetPortId: "input",
          width: 2,
        },
      ],
      fontFamily: "Test",
      fontSize: 10,
      getNode: (nodeId) => nodes.get(nodeId),
      validateGlyphs: () => {},
    });

    const strokes = edgeGraphics.operations
      .filter(([operation]) => operation === "stroke")
      .map(([, style]) => style);
    expect(edgeGraphics.operations[0]).toEqual(["clear"]);
    expect(edgeLabelLayer.removeChildrenCount).toBe(1);
    expect(strokes[0]).toMatchObject({
      alpha: workspaceNeonTheme.semantic.tendril.glowAlpha,
      color,
      width: 2 + workspaceNeonTheme.semantic.tendril.glowWidth,
    });
    expect(
      strokes.some(
        (stroke) =>
          stroke.color === workspaceNeonTheme.semantic.tendril.coreColor &&
          stroke.alpha === workspaceNeonTheme.semantic.tendril.coreAlpha &&
          stroke.width === workspaceNeonTheme.semantic.tendril.coreWidth,
      ),
    ).toBe(true);
    expect(strokes.filter((stroke) => stroke.color === color).length).toBeGreaterThan(2);
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
    height: 68,
    layer: "semantic",
    width: 68,
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

  bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y) {
    this.operations.push(["bezierCurveTo", cp1x, cp1y, cp2x, cp2y, x, y]);
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

class RecordingLayer {
  constructor() {
    this.removeChildrenCount = 0;
  }

  removeChildren() {
    this.removeChildrenCount += 1;
    return [];
  }
}

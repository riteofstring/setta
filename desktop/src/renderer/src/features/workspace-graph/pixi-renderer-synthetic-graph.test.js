import { describe, expect, test } from "vitest";

import { createSyntheticWorkflowGraph } from "./pixi-renderer-synthetic-graph";

describe("workflow graph synthetic data", () => {
  test("creates deterministic nodes and requested edge density", () => {
    const first = createSyntheticWorkflowGraph({ edgesPerNode: 2, nodeCount: 12 });
    const second = createSyntheticWorkflowGraph({ edgesPerNode: 2, nodeCount: 12 });

    expect(first).toEqual(second);
    expect(first.nodes).toHaveLength(12);
    expect(first.edges).toHaveLength(24);
    expect(first.nodes[0]).toMatchObject({
      height: 82,
      id: "synthetic-node-00000",
      label: "Node 0000",
      width: 168,
    });
  });

  test("edges reference generated nodes and workspace ports", () => {
    const graph = createSyntheticWorkflowGraph({ edgesPerNode: 2, nodeCount: 18 });
    const nodeIds = new Set(graph.nodes.map((node) => node.id));

    for (const edge of graph.edges) {
      expect(nodeIds.has(edge.sourceNodeId)).toBe(true);
      expect(nodeIds.has(edge.targetNodeId)).toBe(true);
      expect(edge.sourceNodeId).not.toBe(edge.targetNodeId);
      expect(edge.sourcePortId).toBe("output");
      expect(edge.targetPortId).toBe("input");
    }
  });

  test("rejects unsupported graph sizes specifically", () => {
    expect(() => createSyntheticWorkflowGraph({ edgesPerNode: 1, nodeCount: 1 })).toThrow(
      "synthetic graph requires at least two nodes",
    );
    expect(() => createSyntheticWorkflowGraph({ edgesPerNode: 0, nodeCount: 10 })).toThrow(
      "synthetic graph edgesPerNode must be a positive integer",
    );
  });
});

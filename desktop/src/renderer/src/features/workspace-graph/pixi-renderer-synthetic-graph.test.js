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
      kind: "action",
      layer: "workflow",
      label: "Node 0000",
      status: "not_started",
      width: 168,
    });
    expect(first.edges[1]).toMatchObject({
      layer: "workflow",
      status: "active",
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
    expect(() =>
      createSyntheticWorkflowGraph({
        edgesPerNode: 1,
        nodeCount: 3,
        scene: "merged",
      }),
    ).toThrow("merged synthetic graph requires at least four nodes");
    expect(() =>
      createSyntheticWorkflowGraph({
        edgesPerNode: 1,
        nodeCount: 10,
        scene: "unknown",
      }),
    ).toThrow("unsupported synthetic graph scene");
  });

  test("creates semantic-cell scene with active activity cells", () => {
    const graph = createSyntheticWorkflowGraph({
      edgesPerNode: 1,
      nodeCount: 14,
      scene: "semantic-cells",
    });

    expect(graph.nodes).toHaveLength(14);
    expect(graph.edges).toHaveLength(14);
    expect(graph.nodes[0]).toMatchObject({
      activity: { active: true, count: 1 },
      connectable: false,
      height: 68,
      id: "semantic:synthetic-node-00000",
      layer: "semantic",
      label: "Cell 0000",
      width: 68,
    });
    expect(graph.nodes.filter((node) => node.activity?.active === true)).toHaveLength(2);
    expect(graph.edges[0]).toMatchObject({
      layer: "semantic",
      sourceNodeId: "semantic:synthetic-node-00000",
      targetNodeId: "semantic:synthetic-node-00001",
    });
  });

  test("creates merged scene with workflow and semantic layers", () => {
    const graph = createSyntheticWorkflowGraph({
      edgesPerNode: 1,
      nodeCount: 18,
      scene: "merged",
    });

    expect(graph.nodes).toHaveLength(18);
    expect(graph.edges).toHaveLength(18);
    expect(graph.nodes.some((node) => node.layer === "workflow")).toBe(true);
    expect(graph.nodes.some((node) => node.layer === "semantic")).toBe(true);
    expect(graph.edges.some((edge) => edge.layer === "workflow")).toBe(true);
    expect(graph.edges.some((edge) => edge.layer === "semantic")).toBe(true);
  });
});

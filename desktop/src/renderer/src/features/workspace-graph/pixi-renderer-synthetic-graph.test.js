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

  test("creates canonical running workflow scene for visual parity", () => {
    const graph = createSyntheticWorkflowGraph({
      edgesPerNode: 1,
      nodeCount: 3,
      scene: "workflow-running",
    });

    expect(graph.nodes.map((node) => [node.id, node.status])).toEqual([
      ["start", "succeeded"],
      ["work", "running"],
      ["end", "not_started"],
    ]);
    expect(graph.edges.map((edge) => [edge.id, edge.status])).toEqual([
      ["start_work", "active"],
      ["work_end", "active"],
    ]);
  });

  test("creates running review workflow scene with aggregate runtime indicator", () => {
    const graph = createSyntheticWorkflowGraph({
      edgesPerNode: 1,
      nodeCount: 3,
      scene: "workflow-running-runtime",
    });

    expect(graph.nodes.map((node) => [node.id, node.label, node.status])).toEqual([
      ["start", "Start", "succeeded"],
      ["reviewer", "Reviewer", "running"],
      ["end", "End", "not_started"],
    ]);
    expect(graph.nodes.find((node) => node.id === "reviewer")?.runtime).toMatchObject({
      sourceCount: 6,
      status: "running",
    });
    expect(graph.edges.map((edge) => [edge.id, edge.status])).toEqual([
      ["start_reviewer", "active"],
      ["reviewer_end", "active"],
    ]);
  });

  test("creates merged workflow and semantic scene for visual parity", () => {
    const graph = createSyntheticWorkflowGraph({
      edgesPerNode: 1,
      nodeCount: 6,
      scene: "merged",
    });

    expect(graph.nodes.filter((node) => node.layer === "workflow")).toHaveLength(4);
    expect(graph.nodes.filter((node) => node.layer === "semantic")).toHaveLength(6);
    expect(graph.edges.filter((edge) => edge.layer === "workflow")).toHaveLength(3);
    expect(graph.edges.filter((edge) => edge.layer === "semantic")).toHaveLength(7);
    expect(
      graph.edges.filter((edge) => edge.layer === "workflow").map((edge) => [edge.id, edge.status]),
    ).toEqual([
      ["wf_start_fetch", "active"],
      ["wf_fetch_route", "active"],
      ["wf_route_emit", "inactive"],
    ]);
    expect(graph.nodes.find((node) => node.id === "wf_emit")).toMatchObject({
      label: "Emit findings",
      status: "not_started",
    });
    expect(graph.nodes.find((node) => node.id === "semantic:finding")).toMatchObject({
      label: "Race in refresh",
    });
  });

  test("creates canonical semantic-cell scene for visual parity", () => {
    const graph = createSyntheticWorkflowGraph({
      edgesPerNode: 1,
      nodeCount: 6,
      scene: "semantic-cells",
    });

    expect(graph.nodes.map((node) => node.label)).toEqual([
      "Auth model",
      "Token expiry?",
      "JWT rotation",
      "Race in refresh",
      "Use refresh tokens",
      "No 3rd-party store",
    ]);
    expect(graph.edges.map((edge) => edge.label)).toEqual([
      "about",
      "touches",
      "supports",
      "resolves",
      "constrains",
      "related_to",
    ]);
    expect(
      graph.nodes.filter((node) => node.activity?.active === true).map((node) => node.id),
    ).toEqual(["semantic:question", "semantic:finding"]);
  });

  test("creates deterministic phase 0 workload scenes", () => {
    const graph = createSyntheticWorkflowGraph({
      edgesPerNode: 1,
      nodeCount: 100,
      scene: "phase0-normal",
    });

    expect(graph.nodes.filter((node) => node.layer === "workflow")).toHaveLength(100);
    expect(graph.nodes.filter((node) => node.layer === "semantic")).toHaveLength(25);
    expect(graph.edges).toHaveLength(150);
    expect(graph.nodes[0]).toMatchObject({
      id: "phase0-workflow-node-00000",
      layer: "workflow",
      label: "Phase0 0000",
    });
    expect(graph.nodes.find((node) => node.id === "semantic:phase0-node-00000")).toMatchObject({
      layer: "semantic",
      label: "Phase0 cell 0000",
    });
  });

  test("keeps phase 0 scaling scene central content stable as total nodes grow", () => {
    const small = createSyntheticWorkflowGraph({
      edgesPerNode: 1,
      nodeCount: 100,
      scene: "phase0-scaling",
    });
    const large = createSyntheticWorkflowGraph({
      edgesPerNode: 1,
      nodeCount: 1000,
      scene: "phase0-scaling",
    });

    const centralSmall = small.nodes
      .filter((node) => node.id.startsWith("phase0-workflow-node-"))
      .slice(0, 100)
      .map((node) => [node.id, node.x, node.y]);
    const centralLarge = large.nodes
      .filter((node) => node.id.startsWith("phase0-workflow-node-"))
      .slice(0, 100)
      .map((node) => [node.id, node.x, node.y]);

    expect(centralLarge).toEqual(centralSmall);
    expect(large.nodes.filter((node) => node.layer === "workflow")).toHaveLength(1000);
    expect(large.nodes.filter((node) => node.layer === "semantic")).toHaveLength(25);
  });

  test("keeps phase 0 scaling overflow bounded and disconnected from visible workflow edges", () => {
    const graph = createSyntheticWorkflowGraph({
      edgesPerNode: 1,
      nodeCount: 5000,
      scene: "phase0-scaling",
    });
    const workflowNodes = graph.nodes.filter((node) => node.id.startsWith("phase0-workflow-node-"));
    const visibleWorkflowIds = new Set(workflowNodes.slice(0, 100).map((node) => node.id));
    const overflowWorkflowIds = new Set(workflowNodes.slice(100).map((node) => node.id));
    const overflowXValues = workflowNodes.slice(100).map((node) => node.x);
    const overflowYValues = workflowNodes.slice(100).map((node) => node.y);

    expect(Math.min(...overflowXValues)).toBeGreaterThan(4000);
    expect(Math.max(...overflowXValues)).toBeLessThan(6600);
    expect(Math.max(...overflowYValues) - Math.min(...overflowYValues)).toBeLessThan(4700);
    expect(
      graph.edges
        .filter((edge) => edge.layer === "workflow")
        .some(
          (edge) =>
            (visibleWorkflowIds.has(edge.sourceNodeId) &&
              overflowWorkflowIds.has(edge.targetNodeId)) ||
            (overflowWorkflowIds.has(edge.sourceNodeId) &&
              visibleWorkflowIds.has(edge.targetNodeId)),
        ),
    ).toBe(false);
  });
});

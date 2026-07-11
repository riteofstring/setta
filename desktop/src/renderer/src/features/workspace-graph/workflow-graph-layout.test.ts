import { describe, expect, test } from "vitest";

import type { WorkflowGraph } from "@generated/backend";
import { workflowGraphWithNodeLayout } from "./workflow-graph-layout";

describe("workflowGraphWithNodeLayout", () => {
  test("persists rounded node positions in graph node order", () => {
    const graph = workflowGraphWithNodeLayout(testGraph(), [
      { nodeId: "end", x: 180.6, y: 40.2 },
      { nodeId: "start", x: -180.4, y: -40.5 },
    ]);

    expect(graph.layout.nodes).toEqual([
      { nodeId: "start", x: -180, y: -40 },
      { nodeId: "end", x: 181, y: 40 },
    ]);
  });

  test("drops stale layout positions for removed nodes", () => {
    const graph = workflowGraphWithNodeLayout(
      {
        ...testGraph(),
        layout: {
          nodes: [
            { nodeId: "start", x: -100, y: 0 },
            { nodeId: "removed", x: 100, y: 0 },
          ],
        },
      },
      [],
    );

    expect(graph.layout.nodes).toEqual([{ nodeId: "start", x: -100, y: 0 }]);
  });
});

function testGraph(): WorkflowGraph {
  return {
    agentDefaults: { model: "", permission: null, reasoningEffort: null },
    edges: [
      {
        condition: null,
        fromNodeId: "start",
        id: "start_end",
        kind: "normal",
        toNodeId: "end",
      },
    ],
    layout: { nodes: [] },
    nodes: [
      {
        action: null,
        gateway: null,
        id: "start",
        kind: "start",
        loopGuard: null,
        title: "Start",
      },
      {
        action: null,
        gateway: null,
        id: "end",
        kind: "end",
        loopGuard: null,
        title: "End",
      },
    ],
  };
}

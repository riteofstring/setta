import { describe, expect, test } from "vitest";

import type { WorkflowDraftNodeType } from "./workflow-graph-draft";
import { emptyWorkflowGraph, workflowGraphWithAddedDraftNode } from "./workflow-graph-draft";

describe("workflow graph drafts", () => {
  test("creates a null workflow graph with stable empty arrays", () => {
    expect(emptyWorkflowGraph()).toEqual({
      edges: [],
      layout: { nodes: [] },
      nodes: [],
    });
  });

  test("adds the first draft node at the requested canvas position", () => {
    const graph = workflowGraphWithAddedDraftNode(emptyWorkflowGraph(), "agent_task", {
      x: 120,
      y: 90,
    });

    expect(graph.nodes).toEqual([
      {
        action: {
          codex: {
            freshConversation: true,
            model: "",
            prompt: "Describe this agent task.",
            reasoningEffort: "",
          },
          kind: "agent.codex",
        },
        gateway: null,
        id: "agent_task",
        kind: "action",
        loopGuard: null,
        title: "Agent Task",
      },
    ]);
    expect(graph.layout.nodes).toEqual([{ nodeId: "agent_task", x: 40, y: 49 }]);
  });

  test("creates deterministic IDs for repeated node types", () => {
    const graph = workflowGraphWithAddedDraftNode(
      workflowGraphWithAddedDraftNode(emptyWorkflowGraph(), "start", { x: 0, y: 0 }),
      "start",
      { x: 200, y: 0 },
    );

    expect(graph.nodes.map((node) => node.id)).toEqual(["start", "start_2"]);
    expect(graph.layout.nodes.map((node) => node.nodeId)).toEqual(["start", "start_2"]);
  });

  test("maps control node menu types to backend node kinds", () => {
    const nodeTypes = ["route", "merge", "barrier_join", "end"] satisfies WorkflowDraftNodeType[];
    const graph = nodeTypes.reduce(
      (current, nodeType, index) =>
        workflowGraphWithAddedDraftNode(current, nodeType, { x: index * 100, y: 0 }),
      emptyWorkflowGraph(),
    );

    expect(graph.nodes.map((node) => [node.id, node.kind, node.title])).toEqual([
      ["route", "gateway.xor", "Route"],
      ["merge", "gateway.or", "Merge"],
      ["barrier_join", "gateway.and", "Barrier Join"],
      ["end", "end", "End"],
    ]);
  });
});

import { describe, expect, test } from "vitest";

import type { WorkflowDraftNodeType } from "./workflow-graph-draft";
import {
  emptyWorkflowGraph,
  workflowGraphWithAddedDraftEdge,
  workflowGraphWithAddedDraftNode,
} from "./workflow-graph-draft";

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

  test("adds durable normal edges with deterministic IDs", () => {
    const graph = workflowGraphWithAddedDraftEdge(
      workflowGraphWithAddedDraftNode(
        workflowGraphWithAddedDraftNode(emptyWorkflowGraph(), "start", { x: 0, y: 0 }),
        "agent_task",
        { x: 200, y: 0 },
      ),
      { sourceNodeId: "start", targetNodeId: "agent_task" },
    );

    expect(graph.edges).toEqual([
      {
        condition: null,
        fromNodeId: "start",
        id: "start_agent_task",
        kind: "normal",
        toNodeId: "agent_task",
      },
    ]);
  });

  test("adds durable typed route edges from virtual ports", () => {
    const withNodes = workflowGraphWithAddedDraftNode(
      workflowGraphWithAddedDraftNode(
        workflowGraphWithAddedDraftNode(
          workflowGraphWithAddedDraftNode(emptyWorkflowGraph(), "agent_task", { x: 0, y: 0 }),
          "route",
          { x: 200, y: 0 },
        ),
        "end",
        { x: 400, y: -100 },
      ),
      "end",
      { x: 400, y: 100 },
    );
    const withRouteInput = workflowGraphWithAddedDraftEdge(withNodes, {
      sourceNodeId: "agent_task",
      targetNodeId: "route",
    });
    const graph = workflowGraphWithAddedDraftEdge(
      workflowGraphWithAddedDraftEdge(withRouteInput, {
        sourceNodeId: "route",
        sourcePortId: "route_yes",
        targetNodeId: "end",
      }),
      {
        sourceNodeId: "route",
        sourcePortId: "route_default",
        targetNodeId: "end_2",
      },
    );

    expect(graph.edges).toEqual([
      {
        condition: null,
        fromNodeId: "agent_task",
        id: "agent_task_route",
        kind: "normal",
        toNodeId: "route",
      },
      {
        condition: {
          exitCode: null,
          invert: false,
          kind: "action_signal",
          nodeId: "agent_task",
          signalName: "route",
          signalValue: "yes",
          status: null,
        },
        fromNodeId: "route",
        id: "route_end",
        kind: "normal",
        toNodeId: "end",
      },
      {
        condition: {
          exitCode: null,
          invert: false,
          kind: "default",
          nodeId: "",
          signalName: "",
          signalValue: "",
          status: null,
        },
        fromNodeId: "route",
        id: "route_end_2",
        kind: "normal",
        toNodeId: "end_2",
      },
    ]);
  });

  test("resolves pending route condition sources after the route input is added", () => {
    const withNodes = workflowGraphWithAddedDraftNode(
      workflowGraphWithAddedDraftNode(
        workflowGraphWithAddedDraftNode(emptyWorkflowGraph(), "agent_task", { x: 0, y: 0 }),
        "route",
        { x: 200, y: 0 },
      ),
      "end",
      { x: 400, y: 0 },
    );
    const withRouteOutput = workflowGraphWithAddedDraftEdge(withNodes, {
      sourceNodeId: "route",
      sourcePortId: "route_no",
      targetNodeId: "end",
    });
    expect(withRouteOutput.edges[0]?.condition?.nodeId).toBe("");

    const graph = workflowGraphWithAddedDraftEdge(withRouteOutput, {
      sourceNodeId: "agent_task",
      targetNodeId: "route",
    });

    expect(graph.edges[0]?.condition).toMatchObject({
      kind: "action_signal",
      nodeId: "agent_task",
      signalName: "route",
      signalValue: "no",
    });
  });

  test("creates deterministic IDs for repeated edge endpoints", () => {
    const withNodes = workflowGraphWithAddedDraftNode(
      workflowGraphWithAddedDraftNode(emptyWorkflowGraph(), "start", { x: 0, y: 0 }),
      "agent_task",
      { x: 200, y: 0 },
    );
    const graph = workflowGraphWithAddedDraftEdge(
      workflowGraphWithAddedDraftEdge(withNodes, {
        sourceNodeId: "start",
        targetNodeId: "agent_task",
      }),
      { sourceNodeId: "start", targetNodeId: "agent_task" },
    );

    expect(graph.edges.map((edge) => edge.id)).toEqual(["start_agent_task", "start_agent_task_2"]);
  });

  test("rejects edge endpoints missing from the draft graph", () => {
    expect(() =>
      workflowGraphWithAddedDraftEdge(emptyWorkflowGraph(), {
        sourceNodeId: "start",
        targetNodeId: "agent_task",
      }),
    ).toThrow("Workflow edge references missing node start");
  });
});

import { describe, expect, test } from "vitest";

import { createWorkflowGraphAnimationState } from "./pixi-renderer-animation";

describe("workflow graph animation state", () => {
  test("activates only for visible animated workflow and semantic elements", () => {
    const state = createWorkflowGraphAnimationState({
      animationEnabled: true,
      reduceMotion: false,
    });

    state.recompute({
      edges: [
        {
          id: "edge_active",
          layer: "workflow",
          sourceNodeId: "workflow_running",
          status: "active",
          targetNodeId: "workflow_ready",
        },
        {
          id: "edge_hidden",
          layer: "workflow",
          sourceNodeId: "workflow_hidden",
          status: "active",
          targetNodeId: "workflow_ready",
        },
      ],
      nodes: [
        {
          id: "workflow_running",
          layer: "workflow",
          status: "running",
        },
        {
          id: "workflow_ready",
          layer: "workflow",
          status: "ready",
        },
        {
          id: "semantic_active",
          activity: { active: true, count: 1, kind: "exploring" },
          layer: "semantic",
        },
        {
          id: "workflow_hidden",
          layer: "workflow",
          status: "running",
        },
      ],
      visibleNodeIds: new Set(["workflow_running", "workflow_ready", "semantic_active"]),
    });
    const redraws = [];
    const edgeFlowRedraws = [];
    expect(
      state.tick(1000, {
        redrawEdgeFlow: ({ edges }) => {
          edgeFlowRedraws.push(edges.map((edge) => edge.id));
        },
        redrawNodeGlow: ({ nodes }) => {
          redraws.push(nodes.map((node) => node.id));
        },
      }),
    ).toBe(true);

    expect(state.debugSnapshot()).toMatchObject({
      activeEdgeFlowCount: 1,
      activeNodePulseCount: 2,
      animationActive: true,
      cellAnimCount: 1,
      edgeFlowRedrawCount: 1,
      nodePulseRedrawCount: 1,
      transitionsActive: 0,
    });
    expect(redraws).toEqual([["workflow_running", "workflow_ready", "semantic_active"]]);
    expect(edgeFlowRedraws).toEqual([["edge_active"]]);
  });

  test("disables animation under reduced motion or explicit switch", () => {
    for (const options of [
      { animationEnabled: false, reduceMotion: false },
      { animationEnabled: true, reduceMotion: true },
    ]) {
      const state = createWorkflowGraphAnimationState(options);
      state.recompute({
        edges: [
          {
            id: "edge_active",
            layer: "workflow",
            sourceNodeId: "workflow_running",
            status: "active",
            targetNodeId: "workflow_ready",
          },
        ],
        nodes: [
          { id: "workflow_running", layer: "workflow", status: "running" },
          { id: "workflow_ready", layer: "workflow", status: "ready" },
        ],
        visibleNodeIds: new Set(["workflow_running", "workflow_ready"]),
      });
      expect(state.tick(1000)).toBe(false);

      expect(state.debugSnapshot()).toMatchObject({
        activeEdgeFlowCount: 0,
        activeNodePulseCount: 0,
        animationActive: false,
        cellAnimCount: 0,
        edgeFlowRedrawCount: 0,
        nodePulseRedrawCount: 0,
      });
      expect(state.glowNodes().map((node) => node.id)).toEqual([
        "workflow_running",
        "workflow_ready",
      ]);
    }
  });

  test("keeps finished graphs idle", () => {
    const state = createWorkflowGraphAnimationState({
      animationEnabled: true,
      reduceMotion: false,
    });

    state.recompute({
      edges: [
        {
          id: "edge_completed",
          layer: "workflow",
          sourceNodeId: "workflow_done",
          status: "completed",
          targetNodeId: "workflow_cancelled",
        },
      ],
      nodes: [
        { id: "workflow_done", layer: "workflow", status: "succeeded" },
        { id: "workflow_cancelled", layer: "workflow", status: "cancelled" },
      ],
      visibleNodeIds: new Set(["workflow_done", "workflow_cancelled"]),
    });

    expect(state.tick(1000)).toBe(false);
    expect(state.debugSnapshot()).toMatchObject({
      activeEdgeFlowCount: 0,
      activeNodePulseCount: 0,
      animationActive: false,
      cellAnimCount: 0,
      edgeFlowRedrawCount: 0,
      nodePulseRedrawCount: 0,
    });
    expect(state.glowNodes()).toEqual([]);
  });
});

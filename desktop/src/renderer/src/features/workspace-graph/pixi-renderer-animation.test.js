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
    state.tick();

    expect(state.debugSnapshot()).toMatchObject({
      activeEdgeFlowCount: 1,
      activeNodePulseCount: 2,
      animationActive: true,
      cellAnimCount: 1,
      edgeFlowRedrawCount: 1,
      nodePulseRedrawCount: 1,
      transitionsActive: 0,
    });
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
      state.tick();

      expect(state.debugSnapshot()).toMatchObject({
        activeEdgeFlowCount: 0,
        activeNodePulseCount: 0,
        animationActive: false,
        cellAnimCount: 0,
        edgeFlowRedrawCount: 0,
        nodePulseRedrawCount: 0,
      });
    }
  });
});

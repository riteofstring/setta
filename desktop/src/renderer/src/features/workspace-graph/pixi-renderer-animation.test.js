import { describe, expect, test } from "vitest";

import { createWorkflowGraphAnimationState } from "./pixi-renderer-animation";
import { workspaceNeonTheme } from "./workspace-neon-theme";

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
        {
          id: "semantic_tendril_active",
          layer: "semantic",
          sourceNodeId: "semantic_active",
          targetNodeId: "semantic_neighbor",
        },
        {
          id: "semantic_tendril_inactive",
          layer: "semantic",
          sourceNodeId: "semantic_neighbor",
          targetNodeId: "semantic_other",
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
          id: "workflow_failed",
          layer: "workflow",
          status: "failed",
        },
        {
          id: "workflow_recovery",
          layer: "workflow",
          status: "recovery_required",
        },
        {
          id: "semantic_active",
          activity: { active: true, count: 1, kind: "exploring" },
          layer: "semantic",
        },
        {
          id: "semantic_neighbor",
          activity: null,
          layer: "semantic",
        },
        {
          id: "semantic_other",
          activity: null,
          layer: "semantic",
        },
        {
          id: "workflow_hidden",
          layer: "workflow",
          status: "running",
        },
      ],
      visibleNodeIds: new Set([
        "workflow_running",
        "workflow_ready",
        "workflow_failed",
        "workflow_recovery",
        "semantic_active",
        "semantic_neighbor",
        "semantic_other",
      ]),
    });
    const redraws = [];
    const edgeFlowRedraws = [];
    const cellAnimationRedraws = [];
    const semanticNodeIdSets = [];
    expect(
      state.tick(1000, {
        redrawCellAnimation: ({ nodes }) => {
          cellAnimationRedraws.push(nodes.map((node) => node.id));
        },
        redrawEdgeFlow: ({ activeSemanticNodeIds, edges }) => {
          edgeFlowRedraws.push(edges.map((edge) => edge.id));
          semanticNodeIdSets.push([...activeSemanticNodeIds]);
        },
        redrawNodeGlow: ({ nodes }) => {
          redraws.push(nodes.map((node) => node.id));
        },
      }),
    ).toBe(true);

    expect(state.debugSnapshot()).toMatchObject({
      activeEdgeFlowCount: 1,
      activeNodePulseCount: 4,
      animationActive: true,
      cellAnimCandidateCount: 1,
      cellAnimCapped: false,
      cellAnimCount: 1,
      cellAnimRedrawCount: 1,
      edgeFlowRedrawCount: 1,
      nodePulseRedrawCount: 1,
      semanticTendrilAnimCandidateCount: 1,
      semanticTendrilAnimCapped: false,
      semanticTendrilAnimCount: 1,
      semanticTendrilRedrawCount: 1,
      transitionsActive: 0,
    });
    expect(redraws).toEqual([
      ["workflow_running", "workflow_ready", "workflow_failed", "workflow_recovery"],
    ]);
    expect(edgeFlowRedraws).toEqual([["edge_active", "semantic_tendril_active"]]);
    expect(cellAnimationRedraws).toEqual([["semantic_active"]]);
    expect(semanticNodeIdSets).toEqual([["semantic_active"]]);
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
        cellAnimCandidateCount: 0,
        cellAnimCount: 0,
        edgeFlowRedrawCount: 0,
        nodePulseRedrawCount: 0,
        semanticTendrilAnimCount: 0,
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
      semanticTendrilAnimCount: 0,
    });
    expect(state.glowNodes()).toEqual([]);
  });

  test("caps visible active semantic cells and reports candidate pressure", () => {
    const state = createWorkflowGraphAnimationState({
      animationEnabled: true,
      reduceMotion: false,
    });
    const cellCount = workspaceNeonTheme.semantic.animation.activeCellCap + 2;
    const nodes = Array.from({ length: cellCount }, (_, index) => ({
      activity: { active: true, count: 1, kind: "exploring" },
      id: `semantic:${index}`,
      layer: "semantic",
    }));

    state.recompute({
      edges: [],
      nodes,
      visibleNodeIds: new Set(nodes.map((node) => node.id)),
    });

    expect(state.debugSnapshot()).toMatchObject({
      animationActive: true,
      cellAnimCandidateCount: cellCount,
      cellAnimCap: workspaceNeonTheme.semantic.animation.activeCellCap,
      cellAnimCapped: true,
      cellAnimCount: workspaceNeonTheme.semantic.animation.activeCellCap,
    });
    expect(state.cellNodes()).toHaveLength(workspaceNeonTheme.semantic.animation.activeCellCap);
  });
});

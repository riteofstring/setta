import { describe, expect, test } from "vitest";

import {
  createWorkflowGraphAnimationState,
  workflowGraphAnimationInventory,
} from "./pixi-renderer-animation";

describe("workflow graph animation state", () => {
  test("classifies every graph animation in the Phase 6 inventory", () => {
    expect(
      workflowGraphAnimationInventory.map(
        ({ classification, defaultEnabled, id, stateMeaning }) => ({
          classification,
          defaultEnabled,
          id,
          stateMeaning,
        }),
      ),
    ).toEqual([
      {
        classification: "camera-critical",
        defaultEnabled: true,
        id: "camera-transform",
        stateMeaning: "camera pan/zoom transform",
      },
      {
        classification: "trajectory/liveness",
        defaultEnabled: true,
        id: "workflow-node-pulse",
        stateMeaning: "workflow node is pending, ready, running, failed, waiting, or recovering",
      },
      {
        classification: "trajectory/liveness",
        defaultEnabled: true,
        id: "workflow-edge-flow",
        stateMeaning: "workflow edge is actively carrying work",
      },
      {
        classification: "trajectory/liveness",
        defaultEnabled: true,
        id: "trajectory-runtime-sprites",
        stateMeaning:
          "recent runtime/tool/file/test activity attached to a workflow node or recent lane",
      },
      {
        classification: "semantic state",
        defaultEnabled: true,
        id: "semantic-activity-marker",
        stateMeaning: "semantic node has current or recent named activity",
      },
      {
        classification: "decorative",
        defaultEnabled: false,
        id: "semantic-cell-breath",
        stateMeaning: null,
      },
      {
        classification: "decorative",
        defaultEnabled: false,
        id: "semantic-tendril-flow",
        stateMeaning: null,
      },
    ]);
  });

  test("activates only for visible animated workflow elements", () => {
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
      visibleNodes: [
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
      animationDroppedWorkByLayer: {
        decorative: 2,
        "trajectory/liveness": 0,
      },
      cellAnimCandidateCount: 1,
      cellAnimCapped: false,
      cellAnimCount: 0,
      cellAnimRedrawCount: 0,
      edgeFlowRedrawCount: 1,
      lastDecorativeAnimationDroppedCount: 2,
      lastLivenessAnimationDroppedCount: 0,
      nodePulseRedrawCount: 1,
      semanticTendrilAnimCandidateCount: 1,
      semanticTendrilAnimCapped: false,
      semanticTendrilAnimCount: 0,
      semanticTendrilRedrawCount: 0,
      transitionsActive: 0,
    });
    expect(redraws).toEqual([
      ["workflow_running", "workflow_ready", "workflow_failed", "workflow_recovery"],
    ]);
    expect(edgeFlowRedraws).toEqual([["edge_active"]]);
    expect(cellAnimationRedraws).toEqual([]);
    expect(semanticNodeIdSets).toEqual([[]]);
  });

  test("keeps workflow motion and defers semantic decoration while camera is moving", () => {
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
          id: "semantic_tendril_active",
          layer: "semantic",
          sourceNodeId: "semantic_active",
          targetNodeId: "semantic_neighbor",
        },
      ],
      visibleNodes: [
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
          id: "semantic_neighbor",
          activity: null,
          layer: "semantic",
        },
      ],
      visibleNodeIds: new Set([
        "workflow_running",
        "workflow_ready",
        "semantic_active",
        "semantic_neighbor",
      ]),
    });
    const edgeFlowRedraws = [];
    const cellAnimationRedraws = [];
    const glowRedraws = [];
    const semanticNodeIdSets = [];
    expect(
      state.tick(
        1000,
        {
          redrawCellAnimation: ({ nodes }) => {
            cellAnimationRedraws.push(nodes.map((node) => node.id));
          },
          redrawEdgeFlow: ({ activeSemanticNodeIds, edges }) => {
            edgeFlowRedraws.push(edges.map((edge) => edge.id));
            semanticNodeIdSets.push([...activeSemanticNodeIds]);
          },
          redrawNodeGlow: ({ nodes }) => {
            glowRedraws.push(nodes.map((node) => node.id));
          },
        },
        { cameraMotion: "moving" },
      ),
    ).toBe(true);

    expect(glowRedraws).toEqual([["workflow_running", "workflow_ready"]]);
    expect(edgeFlowRedraws).toEqual([["edge_active"]]);
    expect(cellAnimationRedraws).toEqual([]);
    expect(semanticNodeIdSets).toEqual([[]]);
    expect(state.debugSnapshot()).toMatchObject({
      cellAnimRedrawCount: 0,
      edgeFlowRedrawCount: 1,
      lastDecorativeAnimationDroppedCount: 2,
      lastLivenessAnimationDroppedCount: 0,
      semanticTendrilAnimCandidateCount: 1,
      semanticTendrilRedrawCount: 0,
    });
  });

  test("keeps semantic-only activity idle in the default animation state", () => {
    const state = createWorkflowGraphAnimationState({
      animationEnabled: true,
      reduceMotion: false,
    });

    state.recompute({
      edges: [
        {
          id: "semantic_tendril_active",
          layer: "semantic",
          sourceNodeId: "semantic_active",
          targetNodeId: "semantic_neighbor",
        },
      ],
      visibleNodes: [
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
      ],
      visibleNodeIds: new Set(["semantic_active", "semantic_neighbor"]),
    });
    const edgeFlowRedraws = [];
    expect(
      state.tick(1000, {
        redrawEdgeFlow: ({ edges }) => {
          edgeFlowRedraws.push(edges.map((edge) => edge.id));
        },
      }),
    ).toBe(false);

    expect(edgeFlowRedraws).toEqual([]);
    expect(state.debugSnapshot()).toMatchObject({
      animationActive: false,
      animationDroppedWorkByLayer: {
        decorative: 2,
        "trajectory/liveness": 0,
      },
      cellAnimCandidateCount: 1,
      cellAnimCount: 0,
      cellAnimRedrawCount: 0,
      lastDecorativeAnimationDroppedCount: 2,
      edgeFlowRedrawCount: 0,
      semanticTendrilAnimCandidateCount: 1,
      semanticTendrilRedrawCount: 0,
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
        visibleNodes: [
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
        lastLivenessAnimationDroppedCount: 3,
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
      visibleNodes: [
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

  test("reports semantic activity candidates without enabling default cell animation", () => {
    const state = createWorkflowGraphAnimationState({
      animationEnabled: true,
      reduceMotion: false,
    });
    const cellCount = 12;
    const nodes = Array.from({ length: cellCount }, (_, index) => ({
      activity: { active: true, count: 1, kind: "exploring" },
      id: `semantic:${index}`,
      layer: "semantic",
    }));

    state.recompute({
      edges: [],
      visibleNodes: nodes,
      visibleNodeIds: new Set(nodes.map((node) => node.id)),
    });

    expect(state.debugSnapshot()).toMatchObject({
      animationActive: false,
      animationDroppedWorkByLayer: {
        decorative: cellCount,
        "trajectory/liveness": 0,
      },
      cellAnimCandidateCount: cellCount,
      cellAnimCapped: false,
      cellAnimCount: 0,
      lastDecorativeAnimationDroppedCount: cellCount,
    });
    expect(state.cellNodes()).toHaveLength(0);
  });
});

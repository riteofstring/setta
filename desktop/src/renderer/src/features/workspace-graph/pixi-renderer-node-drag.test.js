import { describe, expect, test, vi } from "vitest";

import { createWorkflowGraphNodeDragController } from "./pixi-renderer-node-drag";

describe("workflow graph node drag cross-owner admission", () => {
  test("dragging a workflow node does not move a selected semantic node", () => {
    const harness = createDragHarness([
      workflowNode("wf", { x: 100, y: 100 }),
      semanticNode("sem", { x: 300, y: 300 }),
    ]);
    harness.select("wf", "sem");

    harness.controller.start("wf", { x: 110, y: 110 });
    harness.controller.move({ x: 160, y: 160 });

    // The grabbed workflow node moves by the pointer delta.
    expect(harness.nodeById("wf")).toMatchObject({ x: 150, y: 150 });
    expect(harness.container("wf")).toMatchObject({ x: 150, y: 150 });
    // The selected semantic node stays put: workflow and semantic have
    // different movement owners, so the drag must not include it.
    expect(harness.nodeById("sem")).toMatchObject({ x: 300, y: 300 });
    expect(harness.container("sem")).toMatchObject({ x: 300, y: 300 });
    expect(harness.spatialQueries.updateNode).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: "sem" }),
    );
  });

  test("records only the workflow node as affected by a cross-owner drag", () => {
    const harness = createDragHarness([
      workflowNode("wf", { x: 100, y: 100 }),
      semanticNode("sem", { x: 300, y: 300 }),
    ]);
    harness.select("wf", "sem");

    harness.controller.start("wf", { x: 110, y: 110 });

    const startInteraction = harness.recordGraphInteraction.mock.calls
      .map(([interaction]) => interaction)
      .find((interaction) => interaction.kind === "node_drag" && interaction.phase === "start");
    expect(startInteraction).toBeDefined();
    expect(startInteraction.affectedNodeIds).toEqual(["wf"]);
  });

  test("still moves every selected node that shares the workflow movement owner", () => {
    const harness = createDragHarness([
      workflowNode("wf-a", { x: 100, y: 100 }),
      workflowNode("wf-b", { x: 400, y: 200 }),
    ]);
    harness.select("wf-a", "wf-b");

    harness.controller.start("wf-a", { x: 110, y: 110 });
    harness.controller.move({ x: 160, y: 160 });

    // Both same-owner workflow nodes follow the same pointer delta (+50, +50).
    expect(harness.nodeById("wf-a")).toMatchObject({ x: 150, y: 150 });
    expect(harness.nodeById("wf-b")).toMatchObject({ x: 450, y: 250 });
  });

  test("excludes a non-movable selected node from a workflow drag", () => {
    const harness = createDragHarness([
      workflowNode("wf", { x: 100, y: 100 }),
      fixedNode("fixed", { x: 500, y: 500 }),
    ]);
    harness.select("wf", "fixed");

    harness.controller.start("wf", { x: 110, y: 110 });
    harness.controller.move({ x: 160, y: 160 });

    expect(harness.nodeById("wf")).toMatchObject({ x: 150, y: 150 });
    expect(harness.nodeById("fixed")).toMatchObject({ x: 500, y: 500 });
  });
});

function workflowNode(id, position) {
  return graphNode(id, "workflow", { kind: "workflow_definition_layout" }, position);
}

function semanticNode(id, position) {
  return graphNode(id, "semantic", { kind: "semantic_layout" }, position);
}

function fixedNode(id, position) {
  return graphNode(id, "workflow", null, position);
}

function graphNode(id, layer, movementOwner, { x, y }) {
  return { height: 60, id, layer, movementOwner, width: 120, x, y };
}

function createDragHarness(nodes) {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const nodeContainers = new Map(nodes.map((node) => [node.id, { x: node.x, y: node.y }]));
  const nodeBodies = new Map(nodes.map((node) => [node.id, { cursor: "grab" }]));
  const selectedNodeIds = new Set();
  const spatialQueries = { updateNode: vi.fn() };
  const recordGraphInteraction = vi.fn();
  const selectOnlyNode = vi.fn((nodeId) => {
    selectedNodeIds.clear();
    selectedNodeIds.add(nodeId);
  });

  const controller = createWorkflowGraphNodeDragController({
    animationCoordinator: { markStaticGlowDirty: vi.fn(), syncActiveSet: vi.fn() },
    handlers: { onNodePositionsChange: vi.fn() },
    labels: { syncLabelPosition: vi.fn(), syncLabelVisibility: vi.fn() },
    nodeBodies,
    nodeContainers,
    nodeOpenClickTracker: { clear: vi.fn(), record: vi.fn() },
    nodes,
    nodesById,
    redrawEdges: vi.fn(),
    recordGraphInteraction,
    requireNode: (nodeId) => {
      const node = nodesById.get(nodeId);
      if (!node) {
        throw new Error(`missing node ${nodeId}`);
      }
      return node;
    },
    sceneGraph: { ensureNodeMaterialized: vi.fn() },
    selectOnlyNode,
    selectedNodeIds,
    spatialQueries,
    viewport: {
      plugins: { pause: vi.fn(), resume: vi.fn() },
      toWorld: (screen) => ({ x: screen.x, y: screen.y }),
    },
  });

  return {
    container: (nodeId) => nodeContainers.get(nodeId),
    controller,
    nodeById: (nodeId) => nodesById.get(nodeId),
    recordGraphInteraction,
    select: (...nodeIds) => {
      selectedNodeIds.clear();
      for (const nodeId of nodeIds) {
        selectedNodeIds.add(nodeId);
      }
    },
    spatialQueries,
  };
}

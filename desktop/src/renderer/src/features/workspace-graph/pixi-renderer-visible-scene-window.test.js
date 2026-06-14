import { describe, expect, test } from "vitest";

import { createVisibleSceneWindow } from "./pixi-renderer-visible-scene-window";

describe("visible scene window", () => {
  test("materializes only visible nodes and reuses pooled node views", () => {
    const nodes = [
      workflowNode("node_a", 0, 0),
      workflowNode("node_b", 240, 0),
      workflowNode("node_c", 480, 0),
    ];
    const nodesById = new Map(nodes.map((node) => [node.id, node]));
    const nodeActivityMarkers = new Map();
    const nodeBodies = new Map();
    const nodeContainers = new Map();
    const nodeDiagnosticMarkers = new Map();
    const nodeOutlines = new Map();
    const nodeShadows = new Map();
    const portVisuals = new Map();
    const portVisualStates = new Map();
    const activeLabels = new Map();
    let enterIds = new Set(["node_a"]);
    let exitIds = new Set(["node_a"]);

    const window = createVisibleSceneWindow({
      acquireLabel: (nodeId, node) => {
        const label = labelStub(node.label);
        activeLabels.set(nodeId, label);
        return label;
      },
      createNodeContainer: (node) =>
        createContainerStub({
          node,
          nodeActivityMarkers,
          nodeBodies,
          nodeDiagnosticMarkers,
          nodeOutlines,
          nodeShadows,
          portVisuals,
          portVisualStates,
        }),
      debugMetrics: {
        measure: (_bucket, callback) => callback(),
      },
      deactivateLabel: (nodeId) => {
        activeLabels.delete(nodeId);
      },
      destroyLabel: (nodeId) => {
        activeLabels.delete(nodeId);
      },
      nodeActivityMarkers,
      nodeBodies,
      nodeContainers,
      nodeDiagnosticMarkers,
      nodeLayer: layerStub(),
      nodeOutlines,
      nodesById,
      nodeShadows,
      portVisuals,
      portVisualStates,
      requireNodeLabel: (nodeId) => activeLabels.get(nodeId),
      spatialQueries: {
        nodesInPaddedViewport: ({ paddingScreenPx }) =>
          nodes.filter((node) => (paddingScreenPx === 384 ? enterIds : exitIds).has(node.id)),
        visibleNodeIds: () => new Set(enterIds),
      },
    });

    const first = window.sync();
    expect([...first.materializedNodeIds]).toEqual(["node_a"]);
    expect(nodeContainers.has("node_a")).toBe(true);
    expect(activeLabels.has("node_a")).toBe(true);

    enterIds = new Set(["node_b"]);
    exitIds = new Set(["node_b"]);
    const second = window.sync();
    expect([...second.materializedNodeIds]).toEqual(["node_b"]);
    expect(nodeContainers.has("node_a")).toBe(false);
    expect(nodeContainers.has("node_b")).toBe(true);
    expect(activeLabels.has("node_a")).toBe(false);

    enterIds = new Set(["node_a"]);
    exitIds = new Set(["node_a"]);
    const third = window.sync();
    expect([...third.materializedNodeIds]).toEqual(["node_a"]);
    expect(nodeContainers.has("node_a")).toBe(true);
    expect(window.debugSnapshot()).toMatchObject({
      materializedNodeCount: 1,
      nodeViewPoolHitCount: 1,
      nodeViewPoolReleaseCount: 2,
      pooledNodeViewCount: 1,
    });
  });
});

function workflowNode(id, x, y) {
  return {
    color: 0x38bdf8,
    height: 82,
    id,
    label: id,
    layer: "workflow",
    ports: [
      { id: "input", label: "", role: "target", xOffset: 20, yRatio: 0.5 },
      { id: "output", label: "", role: "source", xOffset: -20, yRatio: 0.5 },
    ],
    status: "not_started",
    width: 168,
    x,
    y,
  };
}

function createContainerStub({
  node,
  nodeActivityMarkers,
  nodeBodies,
  nodeDiagnosticMarkers,
  nodeOutlines,
  nodeShadows,
  portVisuals,
  portVisualStates,
}) {
  const container = displayObjectStub();
  container.x = node.x;
  container.y = node.y;
  nodeActivityMarkers.set(node.id, graphicsStub());
  nodeBodies.set(node.id, graphicsStub());
  nodeDiagnosticMarkers.set(node.id, graphicsStub());
  nodeOutlines.set(node.id, {
    hoverOutline: graphicsStub(),
    selectedOutline: graphicsStub(),
  });
  nodeShadows.set(node.id, graphicsStub());
  for (const port of node.ports) {
    const key = `${node.id}:${port.id}`;
    portVisuals.set(key, graphicsStub());
    portVisualStates.set(key, "idle");
  }
  return container;
}

function labelStub(text) {
  return {
    scale: { set: () => {} },
    style: { fontSize: 20 },
    text,
    visible: false,
  };
}

function layerStub() {
  return {
    addChild: () => {},
  };
}

function displayObjectStub() {
  return {
    destroy: () => {},
    removeFromParent: () => {},
    scale: { set: () => {} },
  };
}

function graphicsStub() {
  return {
    clear: () => {},
  };
}

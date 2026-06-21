import { describe, expect, test, vi } from "vitest";

import { syncNodeLabelVisibility } from "./pixi-renderer-label-visibility";
import { createWorkflowGraphLabelManager, nodeLabelScreenPosition } from "./pixi-renderer-labels";
import { workspaceNeonTheme } from "./workspace-neon-theme";

describe("workspace graph node labels", () => {
  test("positions workflow labels from card layout and anchors semantic labels below cells", () => {
    const viewport = {
      toScreen: (x, y) => ({ x: x * 2 + 10, y: y * 2 + 20 }),
    };

    expect(
      nodeLabelScreenPosition({
        label: labelStub({ height: 18 }),
        node: nodeStub({ height: 80, layer: "workflow", width: 100, x: 10, y: 20 }),
        viewport,
      }),
    ).toEqual({
      x: (10 + workspaceNeonTheme.workflow.cardLayout.regular.labelCenterX) * 2 + 10,
      y: 140,
    });

    expect(
      nodeLabelScreenPosition({
        label: labelStub({ height: 20 }),
        node: nodeStub({ height: 68, layer: "semantic", width: 68, x: 10, y: 20 }),
        viewport,
      }),
    ).toEqual({
      x: 98,
      y: 196 + workspaceNeonTheme.semantic.cell.labelGapScreenPx + 10,
    });
  });

  test("hides dismissed semantic labels in mid-zoom priority mode unless selected", () => {
    const labels = new Map([
      ["workflow", labelStub({ x: 10, y: 10 })],
      ["semantic:kept", labelStub({ x: 80, y: 10 })],
      ["semantic:dismissed", labelStub({ x: 150, y: 10 })],
      ["semantic:selected-dismissed", labelStub({ x: 220, y: 10 })],
    ]);
    const visibilityReasons = new Map();
    const fontSizeModes = new Map([...labels.keys()].map((nodeId) => [nodeId, "normal"]));

    syncNodeLabelVisibility({
      compactSelectedFontSize: 10,
      fontSizeModes,
      nodeLabels: labels,
      nodes: [
        nodeStub({ id: "workflow", layer: "workflow" }),
        nodeStub({ id: "semantic:kept", layer: "semantic" }),
        nodeStub({ dismissed: true, id: "semantic:dismissed", layer: "semantic" }),
        nodeStub({ dismissed: true, id: "semantic:selected-dismissed", layer: "semantic" }),
      ],
      normalFontSize: 20,
      selectedNodeIds: new Set(["semantic:selected-dismissed"]),
      viewport: { scaled: 1 },
      visibleNodeIds: new Set([
        "workflow",
        "semantic:kept",
        "semantic:dismissed",
        "semantic:selected-dismissed",
      ]),
      visibilityReasons,
    });

    expect(labels.get("workflow").visible).toBe(true);
    expect(labels.get("semantic:kept").visible).toBe(true);
    expect(labels.get("semantic:dismissed").visible).toBe(false);
    expect(labels.get("semantic:selected-dismissed").visible).toBe(true);
    expect(visibilityReasons.get("semantic:dismissed")).toBe("semantic-dismissed");
    expect(visibilityReasons.get("semantic:selected-dismissed")).toBe("selected");
  });
});

describe("workspace graph label transform tier", () => {
  // Phase 1 camera fast path: while the camera moves, only the retained visible
  // labels are repositioned (a bounded transform), with no visibility-window
  // query, declutter, or font/content recomputation.
  test("repositions only visible labels and skips the visibility window", () => {
    const { manager, nodeLabels, nodes, spatialQueries } = labelManagerHarness();
    nodes.set("a", nodeStub({ height: 80, id: "a", layer: "workflow", width: 100, x: 10, y: 20 }));
    nodes.set("b", nodeStub({ height: 80, id: "b", layer: "workflow", width: 100, x: 30, y: 40 }));
    const visibleLabel = labelObjectStub({ visible: true });
    const hiddenLabel = labelObjectStub({ visible: false });
    nodeLabels.set("a", visibleLabel);
    nodeLabels.set("b", hiddenLabel);

    const transformedCount = manager.syncVisibleLabelTransforms();

    expect(transformedCount).toBe(1);
    expect(visibleLabel.position.set).toHaveBeenCalledTimes(1);
    expect(hiddenLabel.position.set).not.toHaveBeenCalled();
    // The expensive settle-time visibility recompute must not run on the transform tier.
    expect(spatialQueries.nodesInPaddedViewport).not.toHaveBeenCalled();
    expect(manager.syncCount()).toBe(0);
    expect(manager.debugSnapshot()).toMatchObject({
      labelTransformSyncCount: 1,
      lastLabelTransformCount: 1,
    });
  });
});

function labelManagerHarness() {
  const nodes = new Map();
  const nodeLabels = new Map();
  const spatialQueries = {
    debugSnapshot: () => ({}),
    nodesInPaddedViewport: vi.fn(() => []),
  };
  const manager = createWorkflowGraphLabelManager({
    debugMetrics: { measure: (_bucket, callback) => callback() },
    getNode: (nodeId) => nodes.get(nodeId) ?? null,
    labelLayer: { addChild: vi.fn(), visible: true },
    loadedNodeLabelFont: { fontFamily: "Test Font" },
    nodeLabels,
    nodeLabelFontSizeModes: new Map(),
    nodeLabelVisibilityReasons: new Map(),
    sceneVisitCounters: null,
    selectedNodeIds: new Set(),
    spatialQueries,
    viewport: { scaled: 1, toScreen: (x, y) => ({ x: x * 2 + 10, y: y * 2 + 20 }) },
  });
  return { manager, nodeLabels, nodes, spatialQueries };
}

function labelObjectStub({ height = 18, visible }) {
  return {
    height,
    position: { set: vi.fn() },
    scale: { set: vi.fn() },
    style: { fontSize: 20 },
    visible,
  };
}

function nodeStub({
  dismissed = false,
  height = 68,
  id = "node",
  layer,
  width = 68,
  x = 0,
  y = 0,
}) {
  return { dismissed, height, id, layer, width, x, y };
}

function labelStub({ height = 18, width = 40, x = 0, y = 0 } = {}) {
  return {
    height,
    style: { fontSize: 20 },
    visible: false,
    width,
    x,
    y,
  };
}

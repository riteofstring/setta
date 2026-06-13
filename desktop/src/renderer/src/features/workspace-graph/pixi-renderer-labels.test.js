import { describe, expect, test } from "vitest";

import { syncNodeLabelVisibility } from "./pixi-renderer-label-visibility";
import { nodeLabelScreenPosition } from "./pixi-renderer-labels";
import { workspaceNeonTheme } from "./workspace-neon-theme";

describe("workspace graph node labels", () => {
  test("keeps workflow labels centered and anchors semantic labels below cells", () => {
    const viewport = {
      toScreen: (x, y) => ({ x: x * 2 + 10, y: y * 2 + 20 }),
    };

    expect(
      nodeLabelScreenPosition({
        label: labelStub({ height: 18 }),
        node: nodeStub({ height: 80, layer: "workflow", width: 100, x: 10, y: 20 }),
        viewport,
      }),
    ).toEqual({ x: 130, y: 140 });

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

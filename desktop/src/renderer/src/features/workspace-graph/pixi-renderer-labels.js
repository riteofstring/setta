import { BitmapText } from "pixi.js";

import {
  compactSelectedNodeLabelBitmapFontSize,
  nodeLabelBitmapFontSize,
  validateNodeLabelGlyphs,
} from "./pixi-renderer-label-font";
import { syncNodeLabelVisibility } from "./pixi-renderer-label-visibility";
import { rendererNodeLayer } from "./pixi-renderer-layers";
import { workflowCardLabelCenterX } from "./pixi-renderer-workflow-card-layout";
import { workspaceNeonTheme } from "./workspace-neon-theme";

export function createWorkflowGraphLabelManager({
  debugMetrics,
  labelLayer,
  loadedNodeLabelFont,
  nodeLabels,
  nodeLabelFontSizeModes,
  nodeLabelVisibilityReasons,
  nodes,
  selectedNodeIds,
  spatialQueries,
  viewport,
}) {
  let labelSyncCount = 0;

  return {
    acquireLabel,
    releaseLabel,
    requireNodeLabel,
    syncAllLabels,
    syncCount: () => labelSyncCount,
    syncLabelPosition,
    syncLabelVisibility,
  };

  function acquireLabel(nodeId, labelNode = null) {
    const existingLabel = nodeLabels.get(nodeId);
    if (existingLabel) {
      return existingLabel;
    }
    const node = labelNode ?? requireNode(nodeId);
    validateNodeLabelGlyphs(node.id, node.label);
    const layer = rendererNodeLayer(node);
    const label = new BitmapText({
      anchor: 0.5,
      style: {
        align: "center",
        fill: 0xf8fafc,
        fontFamily: loadedNodeLabelFont.fontFamily,
        fontSize: layer === "semantic" ? 13 : nodeLabelBitmapFontSize,
      },
      text: node.label,
    });
    label.eventMode = "none";
    label.roundPixels = true;
    nodeLabels.set(nodeId, label);
    nodeLabelFontSizeModes.set(nodeId, "normal");
    nodeLabelVisibilityReasons.set(nodeId, "zoom-hidden");
    labelLayer.addChild(label);
    return label;
  }

  function releaseLabel(nodeId) {
    const label = nodeLabels.get(nodeId);
    if (!label) {
      return;
    }
    nodeLabels.delete(nodeId);
    nodeLabelFontSizeModes.delete(nodeId);
    nodeLabelVisibilityReasons.delete(nodeId);
    label.removeFromParent();
    label.destroy();
  }

  function syncAllLabels() {
    return debugMetrics.measure("label-all-sync", () => {
      syncAllLabelsNow();
    });
  }

  function syncAllLabelsNow() {
    for (const node of nodes) {
      syncLabelPosition(node.id);
    }
    syncLabelVisibility();
    for (const node of nodes) {
      if (rendererNodeLayer(node) === "semantic") {
        syncLabelPosition(node.id);
      }
    }
  }

  function syncLabelPosition(nodeId) {
    return debugMetrics.measure("label-position-sync", () => {
      syncLabelPositionNow(nodeId);
    });
  }

  function syncLabelPositionNow(nodeId) {
    const node = requireNode(nodeId);
    const label = requireNodeLabel(nodeId);
    const screen = nodeLabelScreenPosition({ label, node, viewport });
    label.position.set(Math.round(screen.x), Math.round(screen.y));
    label.scale.set(1);
    const layer = rendererNodeLayer(node);
    label.alpha =
      layer === "semantic"
        ? 0.92
        : layer === "workflow" && node.status === "not_started"
          ? 0.68
          : 1;
    labelSyncCount += 1;
  }

  function syncLabelVisibility() {
    return debugMetrics.measure("label-visibility-sync", () => {
      syncLabelVisibilityNow();
    });
  }

  function syncLabelVisibilityNow() {
    syncNodeLabelVisibility({
      compactSelectedFontSize: compactSelectedNodeLabelBitmapFontSize,
      fontSizeModes: nodeLabelFontSizeModes,
      nodeLabels,
      nodes,
      normalFontSize: nodeLabelBitmapFontSize,
      selectedNodeIds,
      viewport,
      visibleNodeIds: spatialQueries.labelVisibleNodeIds(),
      visibilityReasons: nodeLabelVisibilityReasons,
    });
  }

  function requireNode(nodeId) {
    const node = nodes.find((candidate) => candidate.id === nodeId);
    if (!node) {
      throw new Error(`workflow graph label references missing node: ${nodeId}`);
    }
    return node;
  }

  function requireNodeLabel(nodeId) {
    const label = nodeLabels.get(nodeId);
    if (!label) {
      throw new Error(`workflow graph node label is missing: ${nodeId}`);
    }
    return label;
  }
}

export function nodeLabelScreenPosition({ label, node, viewport }) {
  switch (rendererNodeLayer(node)) {
    case "workflow":
      return viewport.toScreen(node.x + workflowCardLabelCenterX(node), node.y + node.height / 2);
    case "semantic": {
      const membraneBottom = viewport.toScreen(node.x + node.width / 2, node.y + node.height);
      return {
        x: membraneBottom.x,
        y:
          membraneBottom.y +
          workspaceNeonTheme.semantic.cell.labelGapScreenPx +
          Math.max(0, label.height / 2),
      };
    }
  }
  throw new Error(`unsupported workspace graph node layer: ${node.layer}`);
}

import { BitmapText } from "pixi.js";

import {
  compactSelectedNodeLabelBitmapFontSize,
  nodeLabelBitmapFontSize,
  validateNodeLabelGlyphs,
} from "./pixi-renderer-label-font";
import { syncNodeLabelVisibility } from "./pixi-renderer-label-visibility";
import { rendererNodeLayer } from "./pixi-renderer-layers";
import { createPaddedViewportNodeSet } from "./pixi-renderer-visibility-window";
import { workflowCardLabelCenterX } from "./pixi-renderer-workflow-card-layout";
import { workspaceNeonTheme } from "./workspace-neon-theme";

const labelVisibilityEnterPaddingScreenPx = 160;
const labelVisibilityExitPaddingScreenPx = 320;

export function createWorkflowGraphLabelManager({
  debugMetrics,
  getNode,
  labelLayer,
  loadedNodeLabelFont,
  nodeLabels,
  nodeLabelFontSizeModes,
  nodeLabelVisibilityReasons,
  selectedNodeIds,
  spatialQueries,
  viewport,
}) {
  let labelSyncCount = 0;
  let lastLabelVisibilityEnteredCount = 0;
  let lastLabelVisibilityExitedCount = 0;
  let labelVisibilityWindowChangeCount = 0;
  const labelVisibilityWindow = createPaddedViewportNodeSet({
    enterPaddingScreenPx: labelVisibilityEnterPaddingScreenPx,
    exitPaddingScreenPx: labelVisibilityExitPaddingScreenPx,
    getNode: requireNode,
    queryKind: "label-visibility",
    spatialQueries,
  });

  return {
    acquireLabel,
    debugSnapshot,
    releaseLabel,
    requireNodeLabel,
    resetVisibleLabels,
    syncAllLabels,
    syncCount: () => labelSyncCount,
    syncLabelPosition,
    syncLabelVisibility,
    syncVisibleLabels,
    visibleLabelSyncNodeCount,
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
    return syncVisibleLabels();
  }

  function syncVisibleLabels() {
    return debugMetrics.measure("label-visible-sync", () => {
      syncVisibleLabelsNow();
    });
  }

  function syncVisibleLabelsNow() {
    const visibleUpdate = labelVisibilityWindow.sync();
    lastLabelVisibilityEnteredCount = visibleUpdate.enteredNodeIds.size;
    lastLabelVisibilityExitedCount = visibleUpdate.exitedNodeIds.size;
    if (visibleUpdate.changed) {
      labelVisibilityWindowChangeCount += 1;
    }

    const nodesToSync = mergeNodesById(visibleUpdate.visibleNodes, visibleUpdate.exitedNodes);
    const displayNodeIds = spatialQueries.labelVisibleNodeIds();
    for (const node of nodesToSync) {
      syncLabelPosition(node.id);
    }
    debugMetrics.measure("label-visibility-sync", () => {
      syncNodeLabelVisibility({
        compactSelectedFontSize: compactSelectedNodeLabelBitmapFontSize,
        fontSizeModes: nodeLabelFontSizeModes,
        nodeLabels,
        nodes: nodesToSync,
        normalFontSize: nodeLabelBitmapFontSize,
        selectedNodeIds,
        viewport,
        visibleNodeIds: displayNodeIds,
        visibilityReasons: nodeLabelVisibilityReasons,
      });
    });
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
    return syncVisibleLabels();
  }

  function requireNode(nodeId) {
    const node = getNode(nodeId);
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

  function resetVisibleLabels() {
    for (const [nodeId, label] of nodeLabels) {
      label.visible = false;
      nodeLabelVisibilityReasons.set(nodeId, "outside-viewport");
    }
    labelVisibilityWindow.reset();
    lastLabelVisibilityEnteredCount = 0;
    lastLabelVisibilityExitedCount = 0;
  }

  function debugSnapshot() {
    const windowSnapshot = labelVisibilityWindow.debugSnapshot();
    return {
      labelVisibilityEnterPaddingScreenPx,
      labelVisibilityExitPaddingScreenPx,
      labelVisibilityWindowInitialized: windowSnapshot.visibleNodeWindowInitialized,
      labelVisibilityWindowSize: windowSnapshot.visibleNodeWindowSize,
      labelVisibilityWindowChangeCount,
      lastLabelVisibilityEnteredCount,
      lastLabelVisibilityExitedCount,
    };
  }

  function visibleLabelSyncNodeCount() {
    return nodeLabels.size;
  }
}

function mergeNodesById(...nodeLists) {
  const merged = [];
  const seenNodeIds = new Set();
  for (const nodeList of nodeLists) {
    for (const node of nodeList) {
      if (seenNodeIds.has(node.id)) {
        continue;
      }
      merged.push(node);
      seenNodeIds.add(node.id);
    }
  }
  return merged;
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

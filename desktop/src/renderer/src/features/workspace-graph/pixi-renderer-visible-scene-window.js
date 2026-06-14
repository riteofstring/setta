import { validateNodeLabelGlyphs } from "./pixi-renderer-label-font";
import { drawNodeActivityMarker, drawNodeDiagnosticMarker } from "./pixi-renderer-node-geometry";
import { createPaddedViewportNodeSet } from "./pixi-renderer-visibility-window";

const sceneWindowEnterPaddingScreenPx = 384;
const sceneWindowExitPaddingScreenPx = 768;

export function createVisibleSceneWindow({
  acquireLabel,
  createNodeContainer,
  debugMetrics,
  deactivateLabel,
  destroyLabel,
  nodeActivityMarkers,
  nodeBodies,
  nodeContainers,
  nodeDiagnosticMarkers,
  nodeLayer,
  nodeOutlines,
  nodesById,
  nodeShadows,
  portVisuals,
  portVisualStates,
  requireNodeLabel,
  spatialQueries,
}) {
  const pooledNodeViews = new Map();
  const sceneWindow = createPaddedViewportNodeSet({
    enterPaddingScreenPx: sceneWindowEnterPaddingScreenPx,
    exitPaddingScreenPx: sceneWindowExitPaddingScreenPx,
    getNode: requireNode,
    queryKind: "scene-window",
    spatialQueries,
  });
  let sceneWindowChangeCount = 0;
  let lastSceneWindowEnteredCount = 0;
  let lastSceneWindowExitedCount = 0;
  let lastSceneWindowVisibleNodeCount = 0;
  let lastVisibleMaterializedNodeCount = 0;
  let nodeViewPoolHitCount = 0;
  let nodeViewPoolMissCount = 0;
  let nodeViewPoolReleaseCount = 0;
  let nodeViewPoolDestroyCount = 0;

  return {
    debugSnapshot,
    destroyAll,
    destroyNode,
    ensureMaterialized,
    isMaterialized,
    materializedNodeIds,
    reset,
    sync,
  };

  function sync({ force = false } = {}) {
    return debugMetrics.measure("visible-scene-window-sync", () => {
      const update = sceneWindow.sync();
      lastSceneWindowEnteredCount = update.enteredNodeIds.size;
      lastSceneWindowExitedCount = update.exitedNodeIds.size;
      lastSceneWindowVisibleNodeCount = update.visibleNodeIds.size;
      if (update.changed) {
        sceneWindowChangeCount += 1;
      }
      if (!force && !update.changed) {
        syncVisibleMaterializedNodeCount();
        return {
          changed: false,
          materializedNodeIds: materializedNodeIds(),
          visibleNodeIds: update.visibleNodeIds,
        };
      }
      for (const nodeId of [...nodeContainers.keys()]) {
        if (!update.visibleNodeIds.has(nodeId)) {
          deactivateNode(nodeId);
        }
      }
      for (const node of update.visibleNodes) {
        ensureMaterialized(node.id);
      }
      if (force) {
        for (const nodeId of nodeContainers.keys()) {
          updateNodeDisplayObjects(requireNode(nodeId));
        }
      }
      syncVisibleMaterializedNodeCount();
      return {
        changed: true,
        materializedNodeIds: materializedNodeIds(),
        visibleNodeIds: update.visibleNodeIds,
      };
    });
  }

  function ensureMaterialized(nodeId) {
    const node = requireNode(nodeId);
    const existing = nodeContainers.get(nodeId);
    if (existing) {
      updateNodeDisplayObjects(node);
      return existing;
    }
    const pooled = pooledNodeViews.get(nodeId);
    if (pooled) {
      pooledNodeViews.delete(nodeId);
      if (!nodeContainerRequiresRebuild(pooled.node, node)) {
        nodeViewPoolHitCount += 1;
        restoreNodeView(node, pooled);
        return pooled.container;
      }
      destroyNodeView(pooled);
      nodeViewPoolDestroyCount += 1;
    }
    nodeViewPoolMissCount += 1;
    return addNodeDisplayObjects(node);
  }

  function isMaterialized(nodeId) {
    return nodeContainers.has(nodeId);
  }

  function materializedNodeIds() {
    return new Set(nodeContainers.keys());
  }

  function reset() {
    sceneWindow.reset();
    for (const nodeId of [...nodeContainers.keys()]) {
      deactivateNode(nodeId);
    }
    lastSceneWindowEnteredCount = 0;
    lastSceneWindowExitedCount = 0;
    lastSceneWindowVisibleNodeCount = 0;
    lastVisibleMaterializedNodeCount = 0;
  }

  function destroyAll() {
    for (const nodeId of [...nodeContainers.keys()]) {
      destroyNode(nodeId);
    }
    for (const nodeId of [...pooledNodeViews.keys()]) {
      destroyNode(nodeId);
    }
  }

  function destroyNode(nodeId) {
    destroyLabel(nodeId);
    const active = detachActiveNodeView(nodeId);
    if (active) {
      destroyNodeView(active);
      nodeViewPoolDestroyCount += 1;
    }
    const pooled = pooledNodeViews.get(nodeId);
    if (pooled) {
      pooledNodeViews.delete(nodeId);
      destroyNodeView(pooled);
      nodeViewPoolDestroyCount += 1;
    }
  }

  function addNodeDisplayObjects(node) {
    const container = createNodeContainer(node);
    nodeContainers.set(node.id, container);
    nodeLayer.addChild(container);
    acquireLabel(node.id, node);
    return container;
  }

  function restoreNodeView(node, view) {
    nodeContainers.set(node.id, view.container);
    nodeBodies.set(node.id, view.body);
    nodeShadows.set(node.id, view.shadow);
    nodeOutlines.set(node.id, view.outlines);
    nodeDiagnosticMarkers.set(node.id, view.diagnosticMarker);
    nodeActivityMarkers.set(node.id, view.activityMarker);
    for (const [key, visual] of view.portVisualEntries) {
      portVisuals.set(key, visual);
    }
    for (const [key, state] of view.portVisualStateEntries) {
      portVisualStates.set(key, state);
    }
    nodeLayer.addChild(view.container);
    acquireLabel(node.id, node);
    updateNodeDisplayObjects(node);
  }

  function updateNodeDisplayObjects(node) {
    const container = nodeContainers.get(node.id);
    if (!container) {
      throw new Error(`node container is missing during graph update: ${node.id}`);
    }
    container.scale.set(1);
    container.x = node.x;
    container.y = node.y;
    const label = requireNodeLabel(node.id);
    if (label.text !== node.label) {
      validateNodeLabelGlyphs(node.id, node.label);
      label.text = node.label;
    }
    const diagnosticMarker = nodeDiagnosticMarkers.get(node.id);
    if (!diagnosticMarker) {
      throw new Error(`node diagnostic marker is missing during graph update: ${node.id}`);
    }
    drawNodeDiagnosticMarker(diagnosticMarker, node);
    const activityMarker = nodeActivityMarkers.get(node.id);
    if (!activityMarker) {
      throw new Error(`node activity marker is missing during graph update: ${node.id}`);
    }
    drawNodeActivityMarker(activityMarker, node);
  }

  function deactivateNode(nodeId) {
    deactivateLabel(nodeId);
    const view = detachActiveNodeView(nodeId);
    if (!view) {
      return;
    }
    pooledNodeViews.set(nodeId, view);
    nodeViewPoolReleaseCount += 1;
  }

  function detachActiveNodeView(nodeId) {
    const container = nodeContainers.get(nodeId);
    if (!container) {
      return null;
    }
    const view = {
      activityMarker: requiredMapValue(nodeActivityMarkers, nodeId, "node activity marker"),
      body: requiredMapValue(nodeBodies, nodeId, "node body"),
      container,
      diagnosticMarker: requiredMapValue(nodeDiagnosticMarkers, nodeId, "node diagnostic marker"),
      node: { ...requireNode(nodeId) },
      outlines: requiredMapValue(nodeOutlines, nodeId, "node outlines"),
      portVisualEntries: portEntriesForNode(portVisuals, nodeId),
      portVisualStateEntries: portEntriesForNode(portVisualStates, nodeId),
      shadow: requiredMapValue(nodeShadows, nodeId, "node shadow"),
    };
    container.removeFromParent();
    nodeContainers.delete(nodeId);
    nodeActivityMarkers.delete(nodeId);
    nodeBodies.delete(nodeId);
    nodeDiagnosticMarkers.delete(nodeId);
    nodeOutlines.delete(nodeId);
    nodeShadows.delete(nodeId);
    for (const [key] of view.portVisualEntries) {
      portVisuals.delete(key);
    }
    for (const [key] of view.portVisualStateEntries) {
      portVisualStates.delete(key);
    }
    return view;
  }

  function syncVisibleMaterializedNodeCount() {
    const visibleNodeIds = spatialQueries.visibleNodeIds();
    let visibleCount = 0;
    for (const nodeId of nodeContainers.keys()) {
      if (visibleNodeIds.has(nodeId)) {
        visibleCount += 1;
      }
    }
    lastVisibleMaterializedNodeCount = visibleCount;
  }

  function debugSnapshot() {
    const windowSnapshot = sceneWindow.debugSnapshot();
    return {
      lastSceneWindowEnteredCount,
      lastSceneWindowExitedCount,
      lastSceneWindowVisibleNodeCount,
      lastVisibleMaterializedNodeCount,
      materializedNodeCount: nodeContainers.size,
      materializedPortCount: portVisuals.size,
      nodeViewPoolDestroyCount,
      nodeViewPoolHitCount,
      nodeViewPoolMissCount,
      nodeViewPoolReleaseCount,
      pooledNodeViewCount: pooledNodeViews.size,
      sceneWindowChangeCount,
      sceneWindowEnterPaddingScreenPx,
      sceneWindowExitPaddingScreenPx,
      sceneWindowInitialized: windowSnapshot.visibleNodeWindowInitialized,
      sceneWindowSize: windowSnapshot.visibleNodeWindowSize,
    };
  }

  function requireNode(nodeId) {
    const node = nodesById.get(nodeId);
    if (!node) {
      throw new Error(`visible scene window references missing node: ${nodeId}`);
    }
    return node;
  }
}

function portEntriesForNode(map, nodeId) {
  const entries = [];
  for (const [key, value] of map) {
    if (key.startsWith(`${nodeId}:`)) {
      entries.push([key, value]);
    }
  }
  return entries;
}

function requiredMapValue(map, key, label) {
  const value = map.get(key);
  if (!value) {
    throw new Error(`visible scene window missing ${label}: ${key}`);
  }
  return value;
}

function destroyNodeView(view) {
  view.container.removeFromParent();
  view.container.destroy({ children: true });
}

function nodeContainerRequiresRebuild(previous, next) {
  return (
    nodeRebuildStateKey(previous) !== nodeRebuildStateKey(next) ||
    !portsEqual(previous.ports, next.ports)
  );
}

function nodeRebuildStateKey(node) {
  return [
    node.color,
    node.connectable,
    node.dismissed,
    node.height,
    node.layer,
    node.promoted,
    node.semanticRole,
    node.status,
    node.width,
  ].join("\u0000");
}

function portsEqual(previous, next) {
  return JSON.stringify(previous ?? null) === JSON.stringify(next ?? null);
}

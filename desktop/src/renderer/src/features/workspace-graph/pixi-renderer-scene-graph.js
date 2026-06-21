import { createVisibleSceneWindow } from "./pixi-renderer-visible-scene-window";

export function createWorkflowGraphSceneGraphUpdater({
  acquireLabel,
  createNodeContainer,
  debugMetrics,
  edges,
  nodeActivityMarkers,
  nodeBodies,
  nodeContainers,
  nodeDiagnosticMarkers,
  nodeLayer,
  nodeOutlines,
  nodesById,
  nodeShadows,
  nodes,
  portVisuals,
  portVisualStates,
  deactivateLabel,
  destroyLabel,
  requireNodeLabel,
  spatialQueries,
}) {
  let graphUpdateCount = 0;
  let graphUpdateEdgeAddCount = 0;
  let graphUpdateEdgeRemoveCount = 0;
  let graphUpdateEdgeUpdateCount = 0;
  let graphUpdateNodeAddCount = 0;
  let graphUpdateNodeRemoveCount = 0;
  let graphUpdateNodeUpdateCount = 0;
  const visibleScene = createVisibleSceneWindow({
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
  });

  return {
    debugSnapshot: visibleScene.debugSnapshot,
    destroy: visibleScene.destroyAll,
    ensureNodeMaterialized: visibleScene.ensureMaterialized,
    isNodeMaterialized: visibleScene.isMaterialized,
    materializedNodeIds: visibleScene.materializedNodeIds,
    replaceGraph: (nextGraph, { countUpdate, preservedNodePositions = new Map() }) => {
      const nextNodes = nextGraph.nodes.map((node) => ({ ...node }));
      const nextEdges = nextGraph.edges.map((edge) => ({ ...edge }));
      if (countUpdate) {
        recordGraphUpdateCounts(nextNodes, nextEdges);
      }
      debugMetrics.measure("scene-graph-node-diff-update-rebuild", () => {
        applySceneGraphNodes(nextNodes, preservedNodePositions);
      });
      edges.splice(0, edges.length, ...nextEdges);
      return {
        nextEdgeSequence: edges.length + 1,
        workflow: nextGraph.workflow ?? null,
      };
    },
    resetVisibleScene: visibleScene.reset,
    syncVisibleScene: visibleScene.sync,
    updateCounts: () => ({
      graphUpdateCount,
      graphUpdateEdgeAddCount,
      graphUpdateEdgeRemoveCount,
      graphUpdateEdgeUpdateCount,
      graphUpdateNodeAddCount,
      graphUpdateNodeRemoveCount,
      graphUpdateNodeUpdateCount,
    }),
  };

  function recordGraphUpdateCounts(nextNodes, nextEdges) {
    graphUpdateCount += 1;
    const previousNodeIds = new Set(nodes.map((node) => node.id));
    const nextNodeIds = new Set(nextNodes.map((node) => node.id));
    const previousEdgeIds = new Set(edges.map((edge) => edge.id));
    const nextEdgeIds = new Set(nextEdges.map((edge) => edge.id));
    graphUpdateNodeAddCount += countOnlyIn(nextNodeIds, previousNodeIds);
    graphUpdateNodeRemoveCount += countOnlyIn(previousNodeIds, nextNodeIds);
    graphUpdateNodeUpdateCount += countInBoth(previousNodeIds, nextNodeIds);
    graphUpdateEdgeAddCount += countOnlyIn(nextEdgeIds, previousEdgeIds);
    graphUpdateEdgeRemoveCount += countOnlyIn(previousEdgeIds, nextEdgeIds);
    graphUpdateEdgeUpdateCount += countInBoth(previousEdgeIds, nextEdgeIds);
  }

  function applySceneGraphNodes(nextNodes, preservedNodePositions) {
    const existingNodesById = new Map(nodes.map((node) => [node.id, node]));
    const nextNodeIds = new Set(nextNodes.map((node) => node.id));
    for (const node of nodes) {
      if (!nextNodeIds.has(node.id)) {
        visibleScene.destroyNode(node.id);
      }
    }
    const updatedNodes = [];
    for (const nextNode of nextNodes) {
      const existingNode = existingNodesById.get(nextNode.id);
      if (!existingNode) {
        const addedNode = { ...nextNode };
        updatedNodes.push(addedNode);
        continue;
      }
      updatedNodes.push(
        mergeWorkflowGraphSceneNodeForUpdate(existingNode, nextNode, {
          preservedNodePositions,
        }),
      );
    }
    nodes.splice(0, nodes.length, ...updatedNodes);
    syncNodesById(updatedNodes);
  }

  function syncNodesById(updatedNodes) {
    nodesById.clear();
    for (const node of updatedNodes) {
      nodesById.set(node.id, node);
    }
  }
}

export function mergeWorkflowGraphSceneNodeForUpdate(
  existingNode,
  nextNode,
  { preservedNodePositions = new Map() } = {},
) {
  const preservedPosition = preservedNodePositions.get(nextNode.id) ?? null;
  const nextContent = { ...nextNode };
  delete nextContent.x;
  delete nextContent.y;
  Object.assign(existingNode, nextContent);
  existingNode.x = preservedPosition?.x ?? nextNode.x;
  existingNode.y = preservedPosition?.y ?? nextNode.y;
  return existingNode;
}

function countOnlyIn(left, right) {
  let count = 0;
  for (const value of left) {
    if (!right.has(value)) {
      count += 1;
    }
  }
  return count;
}

function countInBoth(left, right) {
  let count = 0;
  for (const value of left) {
    if (right.has(value)) {
      count += 1;
    }
  }
  return count;
}

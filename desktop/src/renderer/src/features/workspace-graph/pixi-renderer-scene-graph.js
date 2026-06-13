import { validateNodeLabelGlyphs } from "./pixi-renderer-label-font";
import { drawNodeActivityMarker, drawNodeDiagnosticMarker } from "./pixi-renderer-node-geometry";

export function createWorkflowGraphSceneGraphUpdater({
  acquireLabel,
  createNodeContainer,
  edges,
  nodeActivityMarkers,
  nodeBodies,
  nodeContainers,
  nodeDiagnosticMarkers,
  nodeLayer,
  nodeOutlines,
  nodeShadows,
  nodes,
  portVisuals,
  portVisualStates,
  releaseLabel,
  requireNodeLabel,
}) {
  let graphUpdateCount = 0;
  let graphUpdateEdgeAddCount = 0;
  let graphUpdateEdgeRemoveCount = 0;
  let graphUpdateEdgeUpdateCount = 0;
  let graphUpdateNodeAddCount = 0;
  let graphUpdateNodeRemoveCount = 0;
  let graphUpdateNodeUpdateCount = 0;

  return {
    replaceGraph: (nextGraph, { countUpdate }) => {
      const nextNodes = nextGraph.nodes.map((node) => ({ ...node }));
      const nextEdges = nextGraph.edges.map((edge) => ({ ...edge }));
      if (countUpdate) {
        recordGraphUpdateCounts(nextNodes, nextEdges);
      }
      applySceneGraphNodes(nextNodes);
      edges.splice(0, edges.length, ...nextEdges);
      return {
        nextEdgeSequence: edges.length + 1,
        workflow: nextGraph.workflow ?? null,
      };
    },
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

  function applySceneGraphNodes(nextNodes) {
    const existingNodesById = new Map(nodes.map((node) => [node.id, node]));
    const nextNodeIds = new Set(nextNodes.map((node) => node.id));
    for (const node of nodes) {
      if (!nextNodeIds.has(node.id)) {
        removeNodeDisplayObjects(node.id);
      }
    }
    const updatedNodes = [];
    for (const nextNode of nextNodes) {
      const existingNode = existingNodesById.get(nextNode.id);
      if (!existingNode || !nodeContainers.has(nextNode.id)) {
        const addedNode = { ...nextNode };
        updatedNodes.push(addedNode);
        addNodeDisplayObjects(addedNode);
        continue;
      }
      if (nodeContainerRequiresRebuild(existingNode, nextNode)) {
        removeNodeDisplayObjects(existingNode.id);
        Object.assign(existingNode, nextNode);
        updatedNodes.push(existingNode);
        addNodeDisplayObjects(existingNode);
        continue;
      }
      Object.assign(existingNode, nextNode);
      updatedNodes.push(existingNode);
      updateNodeDisplayObjects(existingNode);
    }
    nodes.splice(0, nodes.length, ...updatedNodes);
  }

  function addNodeDisplayObjects(node) {
    const container = createNodeContainer(node);
    nodeContainers.set(node.id, container);
    nodeLayer.addChild(container);
    acquireLabel(node.id, node);
  }

  function updateNodeDisplayObjects(node) {
    const container = nodeContainers.get(node.id);
    if (!container) {
      throw new Error(`node container is missing during graph update: ${node.id}`);
    }
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

  function removeNodeDisplayObjects(nodeId) {
    releaseLabel(nodeId);
    const container = nodeContainers.get(nodeId);
    if (container) {
      container.removeFromParent();
      container.destroy({ children: true });
    }
    nodeActivityMarkers.delete(nodeId);
    nodeBodies.delete(nodeId);
    nodeContainers.delete(nodeId);
    nodeDiagnosticMarkers.delete(nodeId);
    nodeOutlines.delete(nodeId);
    nodeShadows.delete(nodeId);
    for (const key of [...portVisuals.keys()]) {
      if (key.startsWith(`${nodeId}:`)) {
        portVisuals.delete(key);
        portVisualStates.delete(key);
      }
    }
  }
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

function nodeContainerRequiresRebuild(previous, next) {
  return (
    previous.color !== next.color ||
    previous.connectable !== next.connectable ||
    previous.height !== next.height ||
    previous.width !== next.width ||
    !portsEqual(previous.ports, next.ports)
  );
}

function portsEqual(previous, next) {
  return JSON.stringify(previous ?? null) === JSON.stringify(next ?? null);
}

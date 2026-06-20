export function createPaddedViewportNodeSet({
  enterPaddingScreenPx,
  exitPaddingScreenPx,
  getNode,
  queryKind,
  spatialQueries,
}) {
  let initialized = false;
  let visibleNodeIds = new Set();

  return {
    debugSnapshot,
    reset,
    sync,
  };

  function debugSnapshot() {
    return {
      visibleNodeWindowInitialized: initialized,
      visibleNodeWindowSize: visibleNodeIds.size,
    };
  }

  function reset() {
    initialized = false;
    visibleNodeIds = new Set();
  }

  function sync() {
    const previousNodeIds = visibleNodeIds;
    const enteringNodes = spatialQueries.nodesInPaddedViewport({
      paddingScreenPx: enterPaddingScreenPx,
      queryKind,
    });
    const retainingNodes = initialized
      ? spatialQueries.nodesInPaddedViewport({
          paddingScreenPx: exitPaddingScreenPx,
          queryKind,
        })
      : enteringNodes;
    const enteringNodeIds = new Set(enteringNodes.map((node) => node.id));
    const nextNodes = [];
    const nextNodeIds = new Set();

    for (const node of retainingNodes) {
      if (!enteringNodeIds.has(node.id) && !previousNodeIds.has(node.id)) {
        continue;
      }
      nextNodes.push(node);
      nextNodeIds.add(node.id);
    }

    const enteredNodeIds = difference(nextNodeIds, previousNodeIds);
    const exitedNodeIds = difference(previousNodeIds, nextNodeIds);
    const exitedNodes = [...exitedNodeIds].map((nodeId) => getNode(nodeId));

    visibleNodeIds = nextNodeIds;
    initialized = true;

    return {
      changed: enteredNodeIds.size > 0 || exitedNodeIds.size > 0,
      enteredNodeIds,
      exitedNodeIds,
      exitedNodes,
      visibleNodeIds: new Set(visibleNodeIds),
      visibleNodes: nextNodes,
    };
  }
}

function difference(left, right) {
  const values = new Set();
  for (const value of left) {
    if (!right.has(value)) {
      values.add(value);
    }
  }
  return values;
}

import { useReactFlow } from "forks/xyflow/core/store";
import { fitView } from "forks/xyflow/core/store/utils";
import { getDimensions } from "forks/xyflow/core/utils";
import _ from "lodash";
import { useNodeInternals } from "state/definitions";

export function getNodes(s = null) {
  const output =  Array.from(s ? s.x.values() : useNodeInternals.getState().x.values());
  console.log("getNodes", output[0]?.position.y)
  return output
}

export function addNodes(nodes) {
  const changes = nodes.map((node) => ({ item: node, type: "add" }));
  onNodesChange(changes);
}

export function deleteNodes(nodeIds) {
  const changes = nodeIds.map((id) => ({ id, type: "remove" }));
  onNodesChange(changes);
}

export function updateNodeDimensions(updates) {
  const { fitViewOnInit, fitViewOnInitDone, fitViewOnInitOptions, domNode } =
    useReactFlow.getState();
  const nodeInternals = useNodeInternals.getState().x;
  const viewportNode = domNode?.querySelector(".react-flow__viewport");

  if (!viewportNode) {
    return;
  }

  const changes = updates.reduce((res, update) => {
    const node = nodeInternals.get(update.id);

    if (node) {
      const dimensions = getDimensions(update.nodeElement);
      const doUpdate = !!(
        dimensions.width &&
        dimensions.height &&
        (node.width !== dimensions.width ||
          node.height !== dimensions.height ||
          update.forceUpdate)
      );

      if (doUpdate) {
        nodeInternals.set(node.id, {
          ...node,
          ...dimensions,
        });

        res.push({
          id: node.id,
          type: "dimensions",
          dimensions,
        });
      }
    }

    return res;
  }, []);

  const nextFitViewOnInitDone =
    fitViewOnInitDone ||
    (fitViewOnInit &&
      !fitViewOnInitDone &&
      fitView({
        initial: true,
        ...fitViewOnInitOptions,
      }));

  useReactFlow.setState({ fitViewOnInitDone: nextFitViewOnInitDone });

  if (changes?.length > 0) {
    onNodesChange(changes);
  }
}

export function updateNodePositions(
  nodeDragItems,
  positionChanged = true,
  dragging = false,
) {
  const changes = nodeDragItems.map((node) => {
    const change = {
      id: node.id,
      type: "position",
      dragging,
    };

    if (positionChanged) {
      change.position = node.position;
    }

    return change;
  });

  if (changes?.length) {
    onNodesChange(changes);
  }
}

export function onNodesChange(changes) {
  const nodeInternals = useNodeInternals.getState().x;
  const newNodes = new Map(nodeInternals)
  for (const c of changes) {
    switch (c.type) {
      case "position": {
        if (typeof c.position !== "undefined") {
          newNodes.get(c.id).position = c.position;
        }
        break;
      }
      case "add": {
        newNodes.set(c.item.id, c.item);
        break;
      }
      case "remove": {
        newNodes.delete(c.id);
        break;
      }
    }
  }
  useNodeInternals.setState({ x: newNodes });
}

export function raiseTempZIndex(nodes) {
  const nodeInternals = useNodeInternals.getState().x;
  const newNodes = _.cloneDeep(nodeInternals);
  for (const [, n] of newNodes) {
    n.tempZIndex = n.zIndex;
  }
  for (const n of nodes) {
    newNodes.get(n.id).tempZIndex = newNodes.get(n.id).zIndex + 1000;
  }
  useNodeInternals.setState({ x: newNodes });
}

export function justMoveANode(id, position) {
  onNodesChange([{ id, type: "position", position }]);
}

import { useReactFlow } from "forks/xyflow/core/store";
import { fitView } from "forks/xyflow/core/store/utils";
import _ from "lodash";
import { useNodeInternals } from "state/definitions";

export function getNodes(s = null) {
  return Array.from(s ? s.x.values() : useNodeInternals.getState().x.values());
}

export function addNodes(nodes) {
  const newNodes = getNewNodes();
  for (const n of nodes) {
    newNodes.set(n.id, n);
  }
  useNodeInternals.setState({ x: newNodes });
}

export function deleteNodes(nodeIds) {
  const newNodes = getNewNodes();
  for (const n of nodeIds) {
    newNodes.delete(n);
  }
  useNodeInternals.setState({ x: newNodes });
}

export function updateNodeDimensions(updates) {
  const { fitViewOnInit, fitViewOnInitDone, fitViewOnInitOptions, domNode } =
    useReactFlow.getState();

  const viewportNode = domNode?.querySelector(".react-flow__viewport");

  if (!viewportNode) {
    return;
  }

  const nextFitViewOnInitDone =
    fitViewOnInitDone ||
    (fitViewOnInit &&
      !fitViewOnInitDone &&
      fitView({
        initial: true,
        ...fitViewOnInitOptions,
      }));

  useReactFlow.setState({ fitViewOnInitDone: nextFitViewOnInitDone });
}

export function updateNodePositions(nodeDragItems) {
  const newNodes = getNewNodes();
  for (const n of nodeDragItems) {
    newNodes.get(n.id).position = n.position;
  }
  useNodeInternals.setState({ x: newNodes });
}

export function raiseTempZIndex(nodes) {
  const newNodes = getNewNodes();
  for (const [, n] of newNodes) {
    n.tempZIndex = n.zIndex;
  }
  for (const n of nodes) {
    newNodes.get(n.id).tempZIndex = newNodes.get(n.id).zIndex + 1000;
  }
  useNodeInternals.setState({ x: newNodes });
}

export function justMoveANode(id, position) {
  const newNodes = getNewNodes();
  newNodes.get(id).position = position;
  useNodeInternals.setState({ x: newNodes });
}

export function getNewNodes() {
  return _.cloneDeep(useNodeInternals.getState().x);
}

import _ from "lodash";
import { useReactFlow } from "xyflow/core/store";
import { fitView } from "xyflow/core/store/utils";
import { getDimensions } from "xyflow/core/utils";
import { createSelectionChange } from "xyflow/core/utils/changes";
import { temporal } from "zundo";
import { createProjectState } from "../utils";

const initialState = { x: new Map(), version: 0 };

export const useNodeInternals = createProjectState(
  temporal((set, get) => ({
    ...initialState,
    setNodes: (nodes) => {
      set((state) => ({ x: createNodeInternals(nodes, state.x) }));
    },
    getNodes: () => Array.from(get().x.values()),
  })),
);

useNodeInternals.temporal.getState().pause();

export function addNodes(nodes) {
  const changes = nodes.map((node) => ({ item: node, type: "add" }));
  onNodesChange(changes);
}

export function deleteNodes(nodeIds) {
  const changes = nodeIds.map((id) => ({ id, type: "remove" }));
  onNodesChange(changes);
}

function createNodeInternals(nodes, nodeInternals) {
  const nextNodeInternals = new Map();

  nodes.forEach((node) => {
    const currInternals = nodeInternals.get(node.id);

    const internals = {
      width: currInternals?.width,
      height: currInternals?.height,
      ...node,
    };

    nextNodeInternals.set(node.id, internals);
  });

  return nextNodeInternals;
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
      fitView(useReactFlow.getState, {
        initial: true,
        ...fitViewOnInitOptions,
      }));

  useNodeInternals.setState({
    x: _.cloneDeep(nodeInternals),
  });
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
  const newNodes = _.cloneDeep(nodeInternals);
  for (const c of changes) {
    switch (c.type) {
      case "select": {
        newNodes.get(c.id).selected = c.selected;
        break;
      }
      case "position": {
        if (typeof c.position !== "undefined" && newNodes.has(c.id)) {
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

export function unselectNodesAndEdges({ nodes }) {
  const nodesToUnselect = nodes
    ? nodes
    : useNodeInternals.getState().getNodes();

  const changedNodes = nodesToUnselect.map((n) => {
    n.selected = false;
    return createSelectionChange(n.id, false);
  });

  if (changedNodes?.length) {
    onNodesChange(changedNodes);
  }
}

export function resetSelectedElements() {
  const nodes = useNodeInternals.getState().getNodes();

  const nodesToUnselect = nodes
    .filter((e) => e.selected)
    .map((n) => createSelectionChange(n.id, false));

  if (nodesToUnselect?.length) {
    onNodesChange(nodesToUnselect);
  }
}

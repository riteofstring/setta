import { MouseEvent, RefObject } from "react";
import { StoreApi } from "zustand";

import { errorMessages } from "../../contants";
import type { Node, ReactFlowState } from "../../types";

export function getMouseHandler(
  id: string,
  getState: StoreApi<ReactFlowState>["getState"],
  handler?: (event: MouseEvent, node: Node) => void,
) {
  return handler === undefined
    ? handler
    : (event: MouseEvent) => {
        const node = getState().nodeInternals.get(id);

        if (node) {
          handler(event, { ...node });
        }
      };
}

// this handler is called by
// 1. the click handler when node is not draggable or selectNodesOnDrag = false
// or
// 2. the on drag start handler when node is draggable and selectNodesOnDrag = true
export function handleNodeClick({
  id,
  store,
  unselect = false,
  nodeRef,
}: {
  id: string;
  store: {
    getState: StoreApi<ReactFlowState>["getState"];
    setState: StoreApi<ReactFlowState>["setState"];
  };
  unselect?: boolean;
  nodeRef?: RefObject<HTMLDivElement>;
}) {
  const {
    addSelectedNodes,
    unselectNodesAndEdges,
    multiSelectionActive,
    nodeInternals,
    onError,
  } = store.getState();
  const node = nodeInternals.get(id);

  if (!node) {
    onError?.("012", errorMessages["error012"](id));
    return;
  }

  store.setState({ nodesSelectionActive: false });

  if (!node.selected) {
    addSelectedNodes([id]);
  } else if (unselect || (node.selected && multiSelectionActive)) {
    unselectNodesAndEdges({ nodes: [node] });

    requestAnimationFrame(() => nodeRef?.current?.blur());
  }
}

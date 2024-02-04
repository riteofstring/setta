import { zoomIdentity } from "d3-zoom";
import type { StoreApi } from "zustand";

import type {
  FitViewOptions,
  Node,
  NodeInternals,
  NodeSelectionChange,
  ReactFlowState,
} from "../types";
import {
  getD3Transition,
  getNodesBounds,
  getViewportForBounds,
} from "../utils/graph";

export function createNodeInternals(
  nodes: Node[],
  nodeInternals: NodeInternals,
): NodeInternals {
  const nextNodeInternals = new Map<string, Node>();

  nodes.forEach((node) => {
    const currInternals = nodeInternals.get(node.id);

    const internals: Node = {
      width: currInternals?.width,
      height: currInternals?.height,
      ...node,
    };

    nextNodeInternals.set(node.id, internals);
  });

  return nextNodeInternals;
}

type InternalFitViewOptions = {
  initial?: boolean;
} & FitViewOptions;

export function fitView(
  get: StoreApi<ReactFlowState>["getState"],
  options: InternalFitViewOptions = {},
) {
  const {
    getNodes,
    width,
    height,
    minZoom,
    maxZoom,
    d3Zoom,
    d3Selection,
    fitViewOnInitDone,
    fitViewOnInit,
  } = get();
  const isInitialFitView =
    options.initial && !fitViewOnInitDone && fitViewOnInit;
  const d3initialized = d3Zoom && d3Selection;

  if (d3initialized && (isInitialFitView || !options.initial)) {
    const nodes = getNodes().filter((n) => {
      const isVisible = options.includeHiddenNodes
        ? n.width && n.height
        : !n.hidden;

      if (options.nodes?.length) {
        return (
          isVisible &&
          options.nodes.some((optionNode) => optionNode.id === n.id)
        );
      }

      return isVisible;
    });

    const nodesInitialized = nodes.every((n) => n.width && n.height);

    if (nodes.length > 0 && nodesInitialized) {
      const bounds = getNodesBounds(nodes);

      const { x, y, zoom } = getViewportForBounds(
        bounds,
        width,
        height,
        options.minZoom ?? minZoom,
        options.maxZoom ?? maxZoom,
        options.padding ?? 0.1,
      );

      const nextTransform = zoomIdentity.translate(x, y).scale(zoom);

      if (typeof options.duration === "number" && options.duration > 0) {
        d3Zoom.transform(
          getD3Transition(d3Selection, options.duration),
          nextTransform,
        );
      } else {
        d3Zoom.transform(d3Selection, nextTransform);
      }

      return true;
    }
  }

  return false;
}

export function handleControlledNodeSelectionChange(
  nodeChanges: NodeSelectionChange[],
  nodeInternals: NodeInternals,
) {
  nodeChanges.forEach((change) => {
    const node = nodeInternals.get(change.id);
    if (node) {
      nodeInternals.set(node.id, {
        ...node,
        selected: change.selected,
      });
    }
  });

  return new Map(nodeInternals);
}

type UpdateNodesAndEdgesParams = {
  changedNodes: NodeSelectionChange[] | null;
  get: StoreApi<ReactFlowState>["getState"];
  set: StoreApi<ReactFlowState>["setState"];
};

export function updateNodesAndEdgesSelections({
  changedNodes,
  get,
}: UpdateNodesAndEdgesParams) {
  const { onNodesChange } = get();

  if (changedNodes?.length) {
    onNodesChange?.(changedNodes);
  }
}

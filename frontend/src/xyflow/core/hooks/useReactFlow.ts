import { useCallback, useMemo } from "react";

import { useStoreApi } from "../hooks/useStore";
import type {
  Instance,
  Node,
  NodeAddChange,
  NodeRemoveChange,
  NodeResetChange,
  ReactFlowInstance,
  Rect,
} from "../types";
import { getOverlappingArea, isRectObject, nodeToRect } from "../utils";
import useViewportHelper from "./useViewportHelper";

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
export default function useReactFlow<
  NodeData = any,
>(): ReactFlowInstance<NodeData> {
  const viewportHelper = useViewportHelper();
  const store = useStoreApi();

  const getNodes = useCallback<Instance.GetNodes<NodeData>>(() => {
    return store
      .getState()
      .getNodes()
      .map((n) => ({ ...n }));
  }, []);

  const getNode = useCallback<Instance.GetNode<NodeData>>((id) => {
    return store.getState().nodeInternals.get(id);
  }, []);

  const setNodes = useCallback<Instance.SetNodes<NodeData>>((payload) => {
    const { getNodes, onNodesChange } = store.getState();
    const nodes = getNodes();
    const nextNodes = typeof payload === "function" ? payload(nodes) : payload;

    if (onNodesChange) {
      const changes =
        nextNodes.length === 0
          ? nodes.map(
              (node) => ({ type: "remove", id: node.id }) as NodeRemoveChange,
            )
          : nextNodes.map(
              (node) =>
                ({ item: node, type: "reset" }) as NodeResetChange<NodeData>,
            );
      onNodesChange(changes);
    }
  }, []);

  const addNodes = useCallback<Instance.AddNodes<NodeData>>((payload) => {
    const nodes = Array.isArray(payload) ? payload : [payload];
    const { onNodesChange } = store.getState();

    if (onNodesChange) {
      const changes = nodes.map(
        (node) => ({ item: node, type: "add" }) as NodeAddChange<NodeData>,
      );
      onNodesChange(changes);
    }
  }, []);

  const toObject = useCallback<Instance.ToObject<NodeData>>(() => {
    const { getNodes, transform } = store.getState();
    const [x, y, zoom] = transform;
    return {
      nodes: getNodes().map((n) => ({ ...n })),
      viewport: {
        x,
        y,
        zoom,
      },
    };
  }, []);

  const getNodeRect = useCallback(
    (
      nodeOrRect: (Partial<Node<NodeData>> & { id: Node["id"] }) | Rect,
    ): [Rect | null, Node<NodeData> | null | undefined, boolean] => {
      const isRect = isRectObject(nodeOrRect);
      const node = isRect
        ? null
        : store.getState().nodeInternals.get(nodeOrRect.id);

      if (!isRect && !node) {
        return [null, null, isRect];
      }

      const nodeRect = isRect ? nodeOrRect : nodeToRect(node!);

      return [nodeRect, node, isRect];
    },
    [],
  );

  const getIntersectingNodes = useCallback<
    Instance.GetIntersectingNodes<NodeData>
  >((nodeOrRect, partially = true, nodes) => {
    const [nodeRect, node, isRect] = getNodeRect(nodeOrRect);

    if (!nodeRect) {
      return [];
    }

    return (nodes || store.getState().getNodes()).filter((n) => {
      if (!isRect && (n.id === node!.id || !n.position)) {
        return false;
      }

      const currNodeRect = nodeToRect(n);
      const overlappingArea = getOverlappingArea(currNodeRect, nodeRect);
      const partiallyVisible = partially && overlappingArea > 0;

      return (
        partiallyVisible || overlappingArea >= nodeRect.width * nodeRect.height
      );
    });
  }, []);

  const isNodeIntersecting = useCallback<Instance.IsNodeIntersecting<NodeData>>(
    (nodeOrRect, area, partially = true) => {
      const [nodeRect] = getNodeRect(nodeOrRect);

      if (!nodeRect) {
        return false;
      }

      const overlappingArea = getOverlappingArea(nodeRect, area);
      const partiallyVisible = partially && overlappingArea > 0;

      return (
        partiallyVisible || overlappingArea >= nodeRect.width * nodeRect.height
      );
    },
    [],
  );

  return useMemo(() => {
    return {
      ...viewportHelper,
      getNodes,
      getNode,
      setNodes,
      addNodes,
      toObject,
      getIntersectingNodes,
      isNodeIntersecting,
    };
  }, [
    viewportHelper,
    getNodes,
    getNode,
    setNodes,
    addNodes,
    toObject,
    getIntersectingNodes,
    isNodeIntersecting,
  ]);
}

import { useEffect } from "react";
import { StoreApi } from "zustand";
import { shallow } from "zustand/shallow";

import { useStore, useStoreApi } from "../../hooks/useStore";
import type {
  CoordinateExtent,
  Node,
  ReactFlowProps,
  ReactFlowState,
  ReactFlowStore,
} from "../../types";

type StoreUpdaterProps = Pick<
  ReactFlowProps,
  | "nodes"
  | "nodesDraggable"
  | "nodesFocusable"
  | "minZoom"
  | "maxZoom"
  | "onNodesChange"
  | "elementsSelectable"
  | "snapToGrid"
  | "snapGrid"
  | "translateExtent"
  | "fitView"
  | "fitViewOptions"
  | "onNodesDelete"
  | "onNodeDragStart"
  | "onNodeDragStop"
  | "onSelectionDragStop"
  | "noPanClassName"
  | "autoPanOnNodeDrag"
  | "onError"
  | "nodeDragThreshold"
>;

const selector = (s: ReactFlowState) => ({
  setNodes: s.setNodes,
  setMinZoom: s.setMinZoom,
  setMaxZoom: s.setMaxZoom,
  setTranslateExtent: s.setTranslateExtent,
  reset: s.reset,
});

function useStoreUpdater<T>(
  value: T | undefined,
  setStoreState: (param: T) => void,
) {
  useEffect(() => {
    if (typeof value !== "undefined") {
      setStoreState(value);
    }
  }, [value]);
}

// updates with values in store that don't have a dedicated setter function
function useDirectStoreUpdater(
  key: keyof ReactFlowStore,
  value: unknown,
  setState: StoreApi<ReactFlowState>["setState"],
) {
  useEffect(() => {
    if (typeof value !== "undefined") {
      setState({ [key]: value });
    }
  }, [value]);
}

const StoreUpdater = ({
  nodes,
  nodesDraggable,
  nodesFocusable,
  minZoom,
  maxZoom,
  onNodesChange,
  elementsSelectable,
  snapGrid,
  snapToGrid,
  translateExtent,
  fitView,
  fitViewOptions,
  onNodesDelete,
  onNodeDragStart,
  onNodeDragStop,
  onSelectionDragStop,
  noPanClassName,
  autoPanOnNodeDrag,
  onError,
  nodeDragThreshold,
}: StoreUpdaterProps) => {
  const {
    setNodes,
    setMinZoom,
    setMaxZoom,
    setTranslateExtent,
    reset,
  } = useStore(selector, shallow);
  const store = useStoreApi();

  useEffect(() => {
    return () => {
      reset();
    };
  }, []);

  useDirectStoreUpdater("nodesDraggable", nodesDraggable, store.setState);
  useDirectStoreUpdater("nodesFocusable", nodesFocusable, store.setState);
  useDirectStoreUpdater(
    "elementsSelectable",
    elementsSelectable,
    store.setState,
  );
  useDirectStoreUpdater("snapToGrid", snapToGrid, store.setState);
  useDirectStoreUpdater("snapGrid", snapGrid, store.setState);
  useDirectStoreUpdater("onNodesChange", onNodesChange, store.setState);
  useDirectStoreUpdater("fitViewOnInit", fitView, store.setState);
  useDirectStoreUpdater("fitViewOnInitOptions", fitViewOptions, store.setState);
  useDirectStoreUpdater("onNodesDelete", onNodesDelete, store.setState);
  useDirectStoreUpdater("onNodeDragStart", onNodeDragStart, store.setState);
  useDirectStoreUpdater("onNodeDragStop", onNodeDragStop, store.setState);
  useDirectStoreUpdater(
    "onSelectionDragStop",
    onSelectionDragStop,
    store.setState,
  );
  useDirectStoreUpdater("noPanClassName", noPanClassName, store.setState);
  useDirectStoreUpdater("autoPanOnNodeDrag", autoPanOnNodeDrag, store.setState);
  useDirectStoreUpdater("onError", onError, store.setState);
  useDirectStoreUpdater("nodeDragThreshold", nodeDragThreshold, store.setState);

  useStoreUpdater<Node[]>(nodes, setNodes);
  useStoreUpdater<number>(minZoom, setMinZoom);
  useStoreUpdater<number>(maxZoom, setMaxZoom);
  useStoreUpdater<CoordinateExtent>(translateExtent, setTranslateExtent);

  return null;
};

export default StoreUpdater;

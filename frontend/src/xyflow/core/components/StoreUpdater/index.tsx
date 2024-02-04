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
  | "elementsSelectable"
  | "snapToGrid"
  | "snapGrid"
  | "translateExtent"
  | "fitView"
  | "fitViewOptions"
  | "noPanClassName"
  | "autoPanOnNodeDrag"
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
  nodesDraggable,
  nodesFocusable,
  minZoom,
  maxZoom,
  elementsSelectable,
  snapGrid,
  snapToGrid,
  translateExtent,
  fitView,
  fitViewOptions,
  noPanClassName,
  autoPanOnNodeDrag,
  nodeDragThreshold,
}: StoreUpdaterProps) => {
  const { setMinZoom, setMaxZoom, setTranslateExtent, reset } =
    useStore(selector, shallow);
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
  useDirectStoreUpdater("fitViewOnInit", fitView, store.setState);
  useDirectStoreUpdater("fitViewOnInitOptions", fitViewOptions, store.setState);
  useDirectStoreUpdater("noPanClassName", noPanClassName, store.setState);
  useDirectStoreUpdater("autoPanOnNodeDrag", autoPanOnNodeDrag, store.setState);
  useDirectStoreUpdater("nodeDragThreshold", nodeDragThreshold, store.setState);

  useStoreUpdater<number>(minZoom, setMinZoom);
  useStoreUpdater<number>(maxZoom, setMaxZoom);
  useStoreUpdater<CoordinateExtent>(translateExtent, setTranslateExtent);

  return null;
};

export default StoreUpdater;

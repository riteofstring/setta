import { useReactFlow } from "forks/xyflow/core/store";
import { useEffect } from "react";
import { StoreApi } from "zustand";
import { shallow } from "zustand/shallow";
import type {
  CoordinateExtent,
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
  | "translateExtent"
  | "fitView"
  | "fitViewOptions"
  | "noPanClassName"
  | "autoPanOnNodeDrag"
  | "nodeDragThreshold"
>;

const selector = (s: ReactFlowState) => ({
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
  translateExtent,
  fitView,
  fitViewOptions,
  noPanClassName,
  autoPanOnNodeDrag,
  nodeDragThreshold,
}: StoreUpdaterProps) => {
  const { setMinZoom, setMaxZoom, setTranslateExtent, reset } = useReactFlow(
    selector,
    shallow,
  );

  useEffect(() => {
    return () => {
      reset();
    };
  }, []);

  useDirectStoreUpdater(
    "nodesDraggable",
    nodesDraggable,
    useReactFlow.setState,
  );
  useDirectStoreUpdater(
    "nodesFocusable",
    nodesFocusable,
    useReactFlow.setState,
  );
  useDirectStoreUpdater(
    "elementsSelectable",
    elementsSelectable,
    useReactFlow.setState,
  );
  useDirectStoreUpdater("fitViewOnInit", fitView, useReactFlow.setState);
  useDirectStoreUpdater(
    "fitViewOnInitOptions",
    fitViewOptions,
    useReactFlow.setState,
  );
  useDirectStoreUpdater(
    "noPanClassName",
    noPanClassName,
    useReactFlow.setState,
  );
  useDirectStoreUpdater(
    "autoPanOnNodeDrag",
    autoPanOnNodeDrag,
    useReactFlow.setState,
  );
  useDirectStoreUpdater(
    "nodeDragThreshold",
    nodeDragThreshold,
    useReactFlow.setState,
  );

  useStoreUpdater<number>(minZoom, setMinZoom);
  useStoreUpdater<number>(maxZoom, setMaxZoom);
  useStoreUpdater<CoordinateExtent>(translateExtent, setTranslateExtent);

  return null;
};

export default StoreUpdater;

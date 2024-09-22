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
  | "elementsSelectable"
  | "translateExtent"
  | "autoPanOnNodeDrag"
>;

const selector = (s: ReactFlowState) => ({
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
  elementsSelectable,
  translateExtent,
  autoPanOnNodeDrag,
}: StoreUpdaterProps) => {
  const { setTranslateExtent, reset } = useReactFlow(selector, shallow);

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
  useDirectStoreUpdater(
    "autoPanOnNodeDrag",
    autoPanOnNodeDrag,
    useReactFlow.setState,
  );

  useStoreUpdater<CoordinateExtent>(translateExtent, setTranslateExtent);

  return null;
};

export default StoreUpdater;

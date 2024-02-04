import { memo, useEffect } from "react";
import { shallow } from "zustand/shallow";

import { useStore, useStoreApi } from "../../hooks/useStore";
import type {
  Node,
  OnSelectionChangeFunc,
  ReactFlowState,
} from "../../types";

type SelectionListenerProps = {
  onSelectionChange?: OnSelectionChangeFunc;
};

const selector = (s: ReactFlowState) => ({
  selectedNodes: s.getNodes().filter((n) => n.selected),
});

type SelectorSlice = ReturnType<typeof selector>;

const selectId = (obj: Node) => obj.id;

function areEqual(a: SelectorSlice, b: SelectorSlice) {
  return (
    shallow(a.selectedNodes.map(selectId), b.selectedNodes.map(selectId))
  );
}

// This is just a helper component for calling the onSelectionChange listener.
// @TODO: Now that we have the onNodesChange listener, do we still need this component?
const SelectionListener = memo(
  ({ onSelectionChange }: SelectionListenerProps) => {
    const store = useStoreApi();
    const { selectedNodes } = useStore(selector, areEqual);

    useEffect(() => {
      const params = { nodes: selectedNodes };
      onSelectionChange?.(params);
      store.getState().onSelectionChange.forEach((fn) => fn(params));
    }, [selectedNodes, onSelectionChange]);

    return null;
  },
);

SelectionListener.displayName = "SelectionListener";

const changeSelector = (s: ReactFlowState) => !!s.onSelectionChange;

function Wrapper({ onSelectionChange }: SelectionListenerProps) {
  const storeHasSelectionChange = useStore(changeSelector);

  if (onSelectionChange || storeHasSelectionChange) {
    return <SelectionListener onSelectionChange={onSelectionChange} />;
  }

  return null;
}

export default Wrapper;

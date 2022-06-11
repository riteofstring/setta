import { useStoreActions, useStoreState } from "easy-peasy";
import { useState } from "react";
import { useReactFlow } from "react-flow-renderer";

import { useMouseToReactFlowPosition } from "./useMouseToReactFlowPosition";

export function useAddToDeck() {
  const setIdsOverview = useStoreActions(
    (x) => x.sectionInfos.setIdsOverviewThunk
  );
  const setSectionInfoAttr = useStoreActions(
    (x) => x.sectionInfos.setSectionInfoAttr
  );

  return (deckId, idsToAdd) => {
    setIdsOverview({
      sectionId: deckId,
      newStateFn: (x) => [...x, ...idsToAdd],
    });
    setSectionInfoAttr({
      sectionIds: idsToAdd,
      attr: "isTopLevel",
      value: false,
    });
  };
}

export function useDragIntoDeck(reactFlowRef) {
  const { getNodes } = useReactFlow();
  const getMousePosition = useMouseToReactFlowPosition(reactFlowRef);
  const [overNode, setOverNode] = useState(null);
  const sectionInfos = useStoreState((x) => x.sectionInfos.x);
  const addToDeck = useAddToDeck();

  function onNodeDrag(e, node) {
    const nodes = getNodes();
    const { x, y } = getMousePosition(e.clientX, e.clientY);
    for (let n of nodes) {
      if (
        n.id !== node.id &&
        x > n.position.x &&
        x < n.position.x + n.width &&
        y > n.position.y &&
        y < n.position.y + n.height
      ) {
        setOverNode(n.id);
        return;
      }
    }
    setOverNode(null);
  }

  function onNodeDragStop(e, node) {
    if (overNode && sectionInfos[overNode].isDeck) {
      addToDeck(overNode, [node.id]);
    }
  }

  function onSelectionDragStart() {}

  function onSelectionDragStop(e, nodes) {}

  return [
    onNodeDrag,
    onNodeDragStop,
    onSelectionDragStart,
    onSelectionDragStop,
  ];
}

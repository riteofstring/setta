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

  function draggingOverNode(e, draggingNodes) {
    const nodes = getNodes();
    const { x, y } = getMousePosition(e.clientX, e.clientY);
    const draggingNodeIds = draggingNodes.map((x) => x.id);
    for (let n of nodes) {
      if (
        !draggingNodeIds.includes(n.id) &&
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

  function dropOverNode(draggingNodes) {
    if (overNode && sectionInfos[overNode].isDeck) {
      addToDeck(
        overNode,
        draggingNodes.map((x) => x.id)
      );
    }
    setOverNode(null);
  }

  function onNodeDrag(e, node) {
    draggingOverNode(e, [node]);
  }

  function onNodeDragStop(e, node) {
    dropOverNode([node]);
  }

  function onSelectionDrag(e, nodes) {
    draggingOverNode(e, nodes);
  }

  function onSelectionDragStop(e, nodes) {
    dropOverNode(nodes);
  }

  return [onNodeDrag, onNodeDragStop, onSelectionDrag, onSelectionDragStop];
}

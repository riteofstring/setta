import { useKeyActivations } from "models/keyActivations";
import { useReactFlowStore } from "models/reactFlowStore";
import { useEffect } from "react";
import { useCreateDeck } from "./useCreateSectionOrDeck";

export function useGroupSectionsOnKeyActivation() {
  const groupSections = useKeyActivations((x) => x.groupSections);
  const createDeck = useCreateDeck();

  useEffect(() => {
    if (groupSections) {
      const store = useReactFlowStore.getState().store;
      const selectedNodes = [...store.getState().nodeInternals].filter(
        (x) => x[1].selected
      );
      const numSelected = selectedNodes.length;
      if (numSelected > 0) {
        const nodeIds = selectedNodes.map((x) => x[1].id);
        const x = Math.min(...selectedNodes.map((x) => x[1].position.x));
        const y = Math.min(...selectedNodes.map((x) => x[1].position.y));
        createDeck({ nodeIds, x, y, projectXY: false });
      }
    }
  }, [groupSections]);
}

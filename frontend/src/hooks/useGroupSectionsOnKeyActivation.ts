import { useKeyActivations } from "models/keyActivations";
import { useEffect } from "react";
import { REACT_FLOW_STORE } from "utils/constants";
import { createDeck } from "./useCreateSectionOrDeck";

export function useGroupSectionsOnKeyActivation() {
  const groupSections = useKeyActivations((x) => x.groupSections);

  useEffect(() => {
    if (groupSections) {
      const store = REACT_FLOW_STORE.store;
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

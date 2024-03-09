import { REACT_FLOW_STORE } from "utils/constants";
import { createDeck } from "./createSectionOrDeck";

export function groupSections() {
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

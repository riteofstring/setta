import { useSectionInfos } from "models/info/sectionInfos";
import { deleteSections, moveSections } from "thunks/sections/sectionOps";
import { PANEID, REACT_FLOW_STORE } from "utils/constants";
import { relativePos } from "./goToSection";

export function undeck(deckId) {
  const childIds = useSectionInfos.getState().x[deckId].children;
  const positions = {};
  childIds.forEach((id) => {
    const { x, y } = relativePos(id);
    positions[id] = { ...REACT_FLOW_STORE.rf.screenToFlowPosition({ x, y }) };
  });
  moveSections({
    oldParentId: deckId,
    newParentId: PANEID,
    sectionIds: childIds,
    positions,
  });
  deleteSections({ sectionIds: [deckId], incrementVersion: true });
}

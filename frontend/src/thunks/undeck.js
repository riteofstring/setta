import { useSectionInfos } from "models/info/sectionInfos";
import { deleteSections, moveSections } from "thunks/sections/sectionOps";
import { PANEID } from "utils/constants";
import { getSectionRect } from "xyflow/core/utils/graph";

export function undeck(deckId) {
  const childIds = useSectionInfos.getState().x[deckId].children;
  const positions = {};
  childIds.forEach((id) => {
    const { x, y } = getSectionRect(id);
    positions[id] = { x, y };
  });
  moveSections({
    oldParentId: deckId,
    newParentId: PANEID,
    sectionIds: childIds,
    positions,
  });
  deleteSections({ sectionIds: [deckId], incrementVersion: true });
}

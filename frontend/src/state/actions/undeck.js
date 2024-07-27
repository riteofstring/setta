import { getSectionRect } from "forks/xyflow/core/utils/graph";
import { deleteSections, moveSections } from "state/actions/sectionOps";
import { useSectionInfos } from "state/definitions";
import { PANEID } from "utils/constants";

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

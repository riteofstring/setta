import {
  deleteSections,
  moveSections,
} from "state/sectionInfos/actions/sectionOps";
import { useSectionInfos } from "state/sectionInfos/definition";
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

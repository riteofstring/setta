import { deleteSections, moveSections } from "thunks/sections/sectionOps";
import { PANEID } from "utils/constants";
import { screenToFlowPosition } from "../utils/reactFlowUtils";
import { relativePos } from "./useGetSectionPosition";
import { useGetAllChildren } from "./useSectionChildren";

export function useUndeck(deckId) {
  const childIds = useGetAllChildren(deckId);

  return () => {
    const positions = {};
    childIds.forEach((id) => {
      const { x, y } = relativePos(id);
      positions[id] = { ...screenToFlowPosition({ x, y }) };
    });
    moveSections({
      oldParentId: deckId,
      newParentId: PANEID,
      sectionIds: childIds,
      positions,
    });
    deleteSections({ sectionIds: [deckId], incrementVersion: true });
  };
}

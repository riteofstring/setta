import { deleteSections, moveSections } from "thunks/sections/sectionOps";
import { PANEID } from "utils/constants";
import { relativePos } from "./useGetSectionPosition";
import { screenToFlowPosition } from "./useMouseToReactFlowPosition";
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

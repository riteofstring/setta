import { useReactFlow } from "reactflow";
import { deleteSections, moveSections } from "thunks/sections/sectionOps";
import { PANEID } from "utils/constants";
import { relativePos } from "./useGetSectionPosition";
import { useGetAllChildren } from "./useSectionChildren";

export function useUndeck(deckId) {
  const childIds = useGetAllChildren(deckId);
  const { project } = useReactFlow();

  return () => {
    const positions = {};
    childIds.forEach((id) => {
      const { x, y } = relativePos(id);
      positions[id] = { ...project({ x, y }) };
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

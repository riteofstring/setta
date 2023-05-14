import { useSectionInfos } from "models/info/sectionInfos";
import { setZIndices } from "thunks/sections/sectionPositions";
import { getHighestAncestor } from "thunks/sections/sectionSizes";

export function useSetReactFlowActiveSectionOnClick(sectionId) {
  return () => {
    const topMostAncestor = getHighestAncestor(sectionId);
    setZIndices([useSectionInfos.getState().x[topMostAncestor]], false);
  };
}

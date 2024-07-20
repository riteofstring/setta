import { useSectionInfos } from "state/sectionInfos/definition";
import { getSectionType } from "../../state/sectionInfos/getters";

export function setAllChildren(sectionId, newStateFn) {
  useSectionInfos.getState().setAllChildren({
    sectionId,
    newStateFn,
  });
  const sectionType = getSectionType(sectionId);
  useSectionInfos.getState().setChildrenNames({ sectionId, sectionType });
}

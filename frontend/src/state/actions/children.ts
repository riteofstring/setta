import { useSectionInfos } from "state/definitions/sectionInfos";
import { getSectionType } from "../getters/sectionInfo";

export function setAllChildren(sectionId, newStateFn) {
  useSectionInfos.getState().setAllChildren({
    sectionId,
    newStateFn,
  });
  const sectionType = getSectionType(sectionId);
  useSectionInfos.getState().setChildrenNames({ sectionId, sectionType });
}

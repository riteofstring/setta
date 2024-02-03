import { useSectionInfos } from "models/info/sectionInfos";
import { getSectionType } from "./getters";

export function setAllChildren(sectionId, newStateFn) {
  useSectionInfos.getState().setAllChildren({
    sectionId,
    newStateFn,
  });
  const sectionType = getSectionType(sectionId);
  useSectionInfos.getState().setChildrenNames({ sectionId, sectionType });
}

import { getSectionType } from "../getters/sectionInfo";
import { setSectionChildren, setSectionChildrenNames } from "./sectionInfos";

export function setAllChildren(sectionId, newStateFn) {
  setSectionChildren({
    sectionId,
    newStateFn,
  });
  const sectionType = getSectionType(sectionId);
  setSectionChildrenNames({ sectionId, sectionType });
}

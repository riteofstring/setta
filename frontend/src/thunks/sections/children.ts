import { useSectionInfos } from "models/info/sectionInfos";
import { getSectionInfo, getSectionIsRoot, getSectionType } from "./getters";

export function updateManyCurrChildren(sectionIds) {
  sectionIds.forEach((x) => updateCurrChildren(x));
}

export function updateCurrChildren(sectionId) {
  const currChildren = computeCurrChildren(sectionId);
  const sectionInfosState = useSectionInfos.getState();
  sectionInfosState.setCurrChildren({ sectionId, currChildren });
  const sectionType = getSectionType(sectionId);
  sectionInfosState.setCurrChildrenNames({ currChildren, sectionType });
}

export function setAllChildren(sectionId, newStateFn) {
  useSectionInfos.getState().setAllChildren({
    sectionId,
    newStateFn,
  });
  updateCurrChildren(sectionId);
}

function computeCurrChildren(sectionId) {
  if (getSectionIsRoot(sectionId)) {
    return getSectionInfo(sectionId).children;
  }
  return [];
}

import _ from "lodash";
import { useSectionInfos } from "state/definitions";

export function getSectionInfo(sectionId) {
  return useSectionInfos.getState().x[sectionId];
}

export function getSectionParentId(sectionId) {
  return getSectionInfo(sectionId).parentId;
}

export function getSectionName(sectionId) {
  return getSectionInfo(sectionId).name;
}

export function getSectionType(sectionId) {
  const sectionTypeId = getSectionInfo(sectionId).uiTypeId;
  return useSectionInfos.getState().uiTypes[sectionTypeId];
}

export function getSectionByName(name) {
  return _.find(useSectionInfos.getState().x, (x) => x.name === name);
}

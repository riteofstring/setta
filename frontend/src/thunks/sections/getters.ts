import _ from "lodash";
import { useSectionInfos } from "models/info/sectionInfos";
import { useUITypes } from "models/info/uiTypes";
import { REACT_FLOW_STORE } from "utils/constants";
import { DECK, INFO, isRoot, OUTPUT, SOCIAL } from "z_utils/constants";
import { SectionUITypeConfigType } from "z_utils/types/uiType";

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
  return useUITypes.getState().x[sectionTypeId];
}

export function getSectionIsRoot(sectionId) {
  return isRoot(getSectionType(sectionId).type);
}

export function getSectionTypeConfig(sectionId) {
  return getSectionType(sectionId).config as SectionUITypeConfigType;
}

export function getSectionCanHaveNested(sectionId) {
  return ![OUTPUT, INFO, SOCIAL].includes(getSectionType(sectionId).type);
}

export function getSectionCanOnlyBeChildOfDeck(sectionId) {
  return [OUTPUT, INFO, SOCIAL].includes(getSectionType(sectionId).type);
}

export function getSectionIsDeck(sectionId) {
  return getSectionType(sectionId).type === DECK;
}

export function getSectionIdsWithUITypeIds(uiTypeIds) {
  const output: string[] = [];
  for (const s of Object.values(useSectionInfos.getState().x)) {
    if (uiTypeIds.includes(s.uiTypeId)) {
      output.push(s.id);
    }
  }
  return output;
}

export function getSectionSiblingNames(sectionId: string) {
  const sectionName = getSectionName(sectionId);
  const parentId = getSectionParentId(sectionId);
  const siblingIds = parentId
    ? _.defaultTo(getSectionInfo(parentId).currChildren, [])
    : [...REACT_FLOW_STORE.store.getState().nodeInternals.keys()];

  const siblingNames = siblingIds.map((x) => getSectionName(x));
  const output = new Set(siblingNames);
  // delete self name
  output.delete(sectionName);
  return output;
}

export function getSectionByName(name: string) {
  return _.find(useSectionInfos.getState().x, (x) => x.name === name);
}

import C from "constants/constants.json";
import _ from "lodash";
import { useNodeInternals, useSectionInfos } from "state/definitions";
import { getIsRoot } from "utils/sectionTypeHelpers";

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

export function getSectionIsRoot(sectionId) {
  return getIsRoot(getSectionType(sectionId).type);
}

export function getSectionCanOnlyBeChildOfDeck(sectionId) {
  return ![C.SECTION, C.LIST_ROOT, C.DICT_ROOT].includes(
    getSectionType(sectionId).type,
  );
}

export function getSectionIsDeck(sectionId) {
  return getSectionType(sectionId).type === C.DECK;
}

export function getSectionSiblingNames(sectionId) {
  const sectionName = getSectionName(sectionId);
  const parentId = getSectionParentId(sectionId);
  const siblingIds = parentId
    ? _.defaultTo(getSectionInfo(parentId).children, [])
    : Array.from(useNodeInternals.getState().x.keys());

  const siblingNames = siblingIds.map((x) => getSectionName(x));
  const output = new Set(siblingNames);
  // delete self name
  output.delete(sectionName);
  return output;
}

export function getSectionByName(name) {
  return _.find(useSectionInfos.getState().x, (x) => x.name === name);
}

import C from "constants/constants.json";
import _ from "lodash";
import { useNodeInternals } from "state/definitions/nodeInternals";
import { useSectionInfos } from "state/definitions/sectionInfos";
import { useUITypes } from "state/definitions/uiTypes";
import { DB_SOURCE_MAPPING } from "utils/constants";
import { isRoot } from "utils/sectionTypeHelpers";

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
  return getSectionType(sectionId).config;
}

export function getSectionCanOnlyBeChildOfDeck(sectionId) {
  return [C.OUTPUT, C.INFO, C.SOCIAL].includes(getSectionType(sectionId).type);
}

export function getSectionIsDeck(sectionId) {
  return getSectionType(sectionId).type === C.DECK;
}

export function getSectionIdsWithUITypeIds(uiTypeIds) {
  const output = [];
  for (const s of Object.values(useSectionInfos.getState().x)) {
    if (uiTypeIds.includes(s.uiTypeId)) {
      output.push(s.id);
    }
  }
  return output;
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

export function getSectionDBSource(sectionId, state=null) {
  const s = state ?? useSectionInfos.getState()
  return s.x[sectionId].dbSource || C.DEFAULT_DB_ALIAS
}

export function getMappedSectionDBSource(sectionId, state=null) {
  return DB_SOURCE_MAPPING[getSectionDBSource(sectionId, state)];
}

export function hasParentInFlattenedStructure(sectionId) {
  let parentId = getSectionParentId(sectionId);
  while (parentId && getSectionIsDeck(parentId)) {
    parentId = getSectionParentId(parentId);
  }
  return parentId !== null;
}

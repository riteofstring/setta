import C from "constants/constants.json";
import _ from "lodash";
import { useNodeInternals } from "models/info/nodeInternals";
import { useUITypes } from "models/info/uiTypes";
import { useSectionInfos } from "state/definitions/sectionInfos";
import { DB_SOURCE_MAPPING } from "utils/constants";
import { isRoot } from "z_utils/constants";
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

export function getSectionCanOnlyBeChildOfDeck(sectionId) {
  return [C.OUTPUT, C.INFO, C.SOCIAL].includes(getSectionType(sectionId).type);
}

export function getSectionIsDeck(sectionId) {
  return getSectionType(sectionId).type === C.DECK;
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
    ? _.defaultTo(getSectionInfo(parentId).children, [])
    : Array.from(useNodeInternals.getState().x.keys());

  const siblingNames = siblingIds.map((x) => getSectionName(x));
  const output = new Set(siblingNames);
  // delete self name
  output.delete(sectionName);
  return output;
}

export function getSectionByName(name: string) {
  return _.find(useSectionInfos.getState().x, (x) => x.name === name);
}

export function getSectionDBSource(sectionId: string) {
  const { dbSource } = getSectionInfo(sectionId);
  return dbSource ? dbSource : C.DEFAULT_DB_ALIAS;
}

export function getMappedSectionDBSource(sectionId: string) {
  return DB_SOURCE_MAPPING[getSectionDBSource(sectionId)];
}

export function hasParentInFlattenedStructure(sectionId: string) {
  let parentId = getSectionParentId(sectionId);
  while (parentId && getSectionIsDeck(parentId)) {
    parentId = getSectionParentId(parentId);
  }
  return parentId !== null;
}

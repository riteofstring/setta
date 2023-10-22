import { DECK, INFO, isRoot, OUTPUT, SOCIAL } from "abcde-utils/src/constants";
import { SectionUITypeConfigType } from "abcde-utils/src/types/uiType";
import { useSectionInfos } from "models/info/sectionInfos";
import { useUITypes } from "models/info/uiTypes";

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

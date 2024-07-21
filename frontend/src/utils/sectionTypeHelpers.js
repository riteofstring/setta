import C from "constants/constants.json";
import U from "constants/uiTypeDisplayNames.json"
import { createVarName } from "./idNameCreation";

export function isRoot(sectionTypeName) {
  return [C.LIST_ROOT, C.DICT_ROOT, C.DECK].includes(sectionTypeName);
}

export function isListRoot(sectionTypeName) {
  return sectionTypeName === C.LIST_ROOT;
}

export function isSeriesElement(sectionSubTypeName) {
  return [C.LIST, C.DICT].includes(sectionSubTypeName);
}

export const rootTypeToChildSubType = {
  [C.LIST_ROOT]: C.LIST,
  [C.DICT_ROOT]: C.DICT,
  [C.DECK]: null,
};

export function isSectionUIType(uiType) {
  return !C.NON_SECTION_TYPES.includes(uiType.type);
}

export function requiresKeyInput(sectionSubTypeName) {
  return [null, C.DICT].includes(sectionSubTypeName);
}

export function getParamSweepSectionName(sectionName) {
  return `${sectionName} Sweep`;
}



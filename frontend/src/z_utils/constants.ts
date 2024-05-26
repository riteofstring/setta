import C from "constants/constants.json";
import { SectionUITypeType, UITypeType } from "./types/uiType";

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

export function isSectionUIType(
  uiType: UITypeType,
): uiType is SectionUITypeType {
  return !C.NON_SECTION_TYPES.includes(uiType.type);
}

export const uiTypesToPretty = Object.freeze(
  new Map(
    Object.entries({
      [C.TEXT]: "Text",
      [C.SLIDER]: "Slider",
      [C.SWITCH]: "Switch",
      [C.SECTION]: "Object",
      [C.LIST_ROOT]: "List of Objects",
      [C.DICT_ROOT]: "Dict of Objects",
      [C.DECK]: "Deck",
      [C.OUTPUT]: "Program Output",
      [C.INFO]: "Info",
      [C.SOCIAL]: "Social",
      [C.GLOBAL_VARIABLES]: "Global Variables",
      [C.CODE]: "Code",
      [C.VAR_CONTROL]: "Variable Control",
      [C.PARAM_SWEEP]: "Parameter Sweep",
      [C.TERMINAL]: "Terminal",
      [C.GLOBAL_PARAM_SWEEP]: "Global Param Sweep",
    }),
  ),
);

export function requiresKeyInput(sectionSubTypeName) {
  return [null, C.DICT].includes(sectionSubTypeName);
}

export function getParamSweepSectionName(sectionName) {
  return `${sectionName} Sweep`;
}

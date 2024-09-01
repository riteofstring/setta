import C from "constants/constants.json";

export function isRoot(sectionTypeName) {
  return [C.LIST_ROOT, C.DICT_ROOT, C.DECK].includes(sectionTypeName);
}

export function isListRoot(sectionTypeName) {
  return sectionTypeName === C.LIST_ROOT;
}

export function isSectionUIType(uiType) {
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
      [C.ARTIFACT]: "Program Artifact",
      [C.INFO]: "Info",
      [C.SOCIAL]: "Social",
      [C.GLOBAL_VARIABLES]: "Global Variables",
      [C.CODE]: "Code",
      [C.INTERACTIVE_CODE]: "Interactive Code",
      [C.PARAM_SWEEP]: "Parameter Sweep",
      [C.TERMINAL]: "Terminal",
      [C.GLOBAL_PARAM_SWEEP]: "Global Param Sweep",
    }),
  ),
);

export function getParamSweepSectionName(sectionName) {
  return `${sectionName} Sweep`;
}

export const PresetType = {
  BASE: "BASE",
  USER: "USER",
};

export function isBasePreset(uiType) {
  return uiType.presetType === PresetType.BASE;
}

export function isUserPreset(uiType) {
  return uiType.presetType === PresetType.USER;
}

export function isPreset(uiType) {
  return isBasePreset(uiType) || isUserPreset(uiType);
}

import C from "constants/constants.json";
import { SectionUITypeType, UITypeType } from "./types/uiType";

export const SECTION_TYPE_NAMES = [
  C.SECTION,
  C.LIST_ROOT,
  C.DICT_ROOT,
  C.DECK,
  C.OUTPUT,
  C.INFO,
  C.SOCIAL,
  C.GLOBAL_VARIABLES,
  C.CODE,
  C.VAR_CONTROL,
  C.PARAM_SWEEP,
  C.TERMINAL,
  C.GLOBAL_PARAM_SWEEP,
];

export const DEFAULT_BASE_UI_TYPE_ID = "3fdaeb6a-e989-4888-b844-17a76f0b0192";
export const DEFAULT_SECTION_UI_TYPE_ID =
  "0191cde4-3d98-4ba0-972a-fead19b8ac73";
export const DECK_UI_TYPE_ID = "0e050316-06ca-48f4-92c1-9845abdf85f7";
export const GLOBAL_VARIABLES_UI_TYPE_ID =
  "b2cda88e-7b77-4dff-8503-3c7e07a3ff0a";
export const CODE_UI_TYPE_ID = "af9f2cfd-8cb6-44fd-9736-eefffae4cd29";
export const VAR_CONTROL_UI_TYPE_ID = "a2ecb6fe-45c7-4e8b-8424-8d5955256f89";
export const PARAM_SWEEP_UI_TYPE_ID = "af0538a7-9667-400e-987e-ae3c844e0fcd";
export const SWITCH_UI_TYPE_ID = "69cdf4c5-7555-4ef3-93d3-bda03f33c6d5";
export const TERMINAL_UI_TYPE_ID = "d6d40533-ee47-42a5-8b55-5455716c71ac";
export const GLOBAL_PARAM_SWEEP_UI_TYPE_ID =
  "02f5da7b-71ae-4e42-b5b3-286fae1823ee";
export const LIST_ROOT_UI_TYPE_ID = "ab68ebd2-7a99-47d6-a7ec-b45857bcd49f";
export const DICT_ROOT_UI_TYPE_ID = "623a9242-53e9-4b42-b695-431e9754a836";
export const INFO_UI_TYPE_ID = "2b06a83b-b96a-490d-a2d7-3631619e6495";

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
  return SECTION_TYPE_NAMES.includes(uiType.type);
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

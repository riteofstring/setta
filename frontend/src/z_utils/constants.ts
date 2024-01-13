import { SectionUITypeType, UITypeType } from "./types/uiType";

export const TEXT = "TEXT";
export const SLIDER = "SLIDER";
export const SWITCH = "SWITCH";
export const SECTION = "SECTION";
export const LIST = "LIST";
export const DICT = "DICT";
export const DECK = "DECK";
export const LIST_ROOT = "LIST_ROOT";
export const DICT_ROOT = "DICT_ROOT";
export const OUTPUT = "OUTPUT";
export const INFO = "INFO";
export const SOCIAL = "SOCIAL";
export const GLOBAL_VARIABLES = "GLOBAL_VARIABLES";
export const SCRIPT = "SCRIPT";
export const CODE = "CODE";
export const VAR_CONTROL = "VAR_CONTROL";
export const PARAM_SWEEP = "PARAM_SWEEP";
export const TERMINAL = "TERMINAL"
export const SECTION_TYPE_NAMES = [
  SECTION,
  LIST_ROOT,
  DICT_ROOT,
  DECK,
  OUTPUT,
  INFO,
  SOCIAL,
  GLOBAL_VARIABLES,
  SCRIPT,
  CODE,
  VAR_CONTROL,
  PARAM_SWEEP,
  TERMINAL
];

export const DEFAULT_BASE_UI_TYPE_ID = "3fdaeb6a-e989-4888-b844-17a76f0b0192";
export const DEFAULT_SECTION_UI_TYPE_ID =
  "0191cde4-3d98-4ba0-972a-fead19b8ac73";
export const DECK_UI_TYPE_ID = "0e050316-06ca-48f4-92c1-9845abdf85f7";
export const GLOBAL_VARIABLES_UI_TYPE_ID =
  "b2cda88e-7b77-4dff-8503-3c7e07a3ff0a";
export const SCRIPT_UI_TYPE_ID = "c24d248d-ce4c-441a-a05f-f4ff302407ff";
export const CODE_UI_TYPE_ID = "af9f2cfd-8cb6-44fd-9736-eefffae4cd29";
export const VAR_CONTROL_UI_TYPE_ID = "a2ecb6fe-45c7-4e8b-8424-8d5955256f89";
export const PARAM_SWEEP_UI_TYPE_ID = "af0538a7-9667-400e-987e-ae3c844e0fcd";
export const SWITCH_UI_TYPE_ID = "69cdf4c5-7555-4ef3-93d3-bda03f33c6d5";
export const TERMINAL_UI_TYPE_ID = "d6d40533-ee47-42a5-8b55-5455716c71ac"

export function isRoot(sectionTypeName) {
  return [LIST_ROOT, DICT_ROOT, DECK].includes(sectionTypeName);
}

export function isListRoot(sectionTypeName) {
  return sectionTypeName === LIST_ROOT;
}

export function isSeriesElement(sectionSubTypeName) {
  return [LIST, DICT].includes(sectionSubTypeName);
}

export const rootTypeToChildSubType = {
  [LIST_ROOT]: LIST,
  [DICT_ROOT]: DICT,
  [DECK]: null,
};

export function isSectionUIType(
  uiType: UITypeType
): uiType is SectionUITypeType {
  return SECTION_TYPE_NAMES.includes(uiType.type);
}

export const uiTypesToPretty = Object.freeze(
  new Map(
    Object.entries({
      [TEXT]: "Text",
      [SLIDER]: "Slider",
      [SWITCH]: "Switch",
      [SECTION]: "Object",
      [LIST_ROOT]: "List of Objects",
      [DICT_ROOT]: "Dict of Objects",
      [DECK]: "Deck",
      [OUTPUT]: "Program Output",
      [INFO]: "Info",
      [SOCIAL]: "Social",
      [GLOBAL_VARIABLES]: "Global Variables",
      [SCRIPT]: "Script",
      [CODE]: "Code",
      [VAR_CONTROL]: "Variable Control",
      [PARAM_SWEEP]: "Parameter Sweep",
      [TERMINAL]: "Terminal"
    })
  )
);

export function requiresKeyInput(sectionSubTypeName) {
  return [null, DICT].includes(sectionSubTypeName);
}

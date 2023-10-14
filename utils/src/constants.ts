import { SectionUITypeType, UITypeType } from "./types/uiType";

export const TEXT = "TEXT";
export const SLIDER = "SLIDER";
export const SWITCH = "SWITCH";
export const REF = "REF";
export const SECTION = "SECTION";
export const LIST = "LIST";
export const DICT = "DICT";
export const DECK = "DECK";
export const LIST_ROOT = "LIST_ROOT";
export const DICT_ROOT = "DICT_ROOT";
export const OUTPUT = "OUTPUT";
export const INFO = "INFO";
export const SOCIAL = "SOCIAL";
export const FN = "FN";
export const GLOBAL_VARIABLES = "GLOBAL_VARIABLES";
export const SECTION_TYPE_NAMES = [
  SECTION,
  LIST_ROOT,
  DICT_ROOT,
  DECK,
  OUTPUT,
  INFO,
  SOCIAL,
  FN,
  GLOBAL_VARIABLES,
];

export const DEFAULT_BASE_UI_TYPE_ID = "3fdaeb6a-e989-4888-b844-17a76f0b0192";
export const DEFAULT_SECTION_UI_TYPE_ID =
  "0191cde4-3d98-4ba0-972a-fead19b8ac73";
export const DECK_UI_TYPE_ID = "0e050316-06ca-48f4-92c1-9845abdf85f7";
export const REF_UI_TYPE_ID = "0595871f-4506-4bda-b6f1-9a3864e02a68";
export const FN_UI_TYPE_ID = "51470547-1f60-4933-952c-ac8745b30b22";

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
      [REF]: "Reference to Object",
      [INFO]: "Info",
      [SOCIAL]: "Social",
      [FN]: "Function",
      [GLOBAL_VARIABLES]: "Global Variables",
    })
  )
);

export function requiresNestedSection(uiTypeType) {
  return SECTION_TYPE_NAMES.includes(uiTypeType);
}

export function requiresKeyInput(sectionSubTypeName) {
  return [null, DICT].includes(sectionSubTypeName);
}

export const NO_AUTH = process.env.REACT_APP_NO_AUTH;
export const NO_CONTEXT_MENU = process.env.REACT_APP_NO_CONTEXT_MENU;
export const BACKEND = "http://localhost:8000/";
export const SECTIONWIDTH = 450;
export const PANEID = -1;
export const DEFAULT_ENTERED_TEXT = "// write your code here";
export const OVERVIEW = "overview";
export const UI_EDITOR = "uiEditor";
export const CONTEXT_MENU = "contextMenu";
export const INDICATOR_GOTO_PARENT = "indicator_goto_parent";

export const TEXT = "TEXT";
export const SLIDER = "SLIDER";
export const SWITCH = "SWITCH";
export const REF = "REF";
export const LIST_ROOT = "LIST_ROOT";
export const DICT_ROOT = "DICT_ROOT";
export const SECTION = "SECTION";
export const COLLECTION = "collection";

// section sub types
export const LIST = "LIST";
export const DICT = "DICT";
export const DECK = "DECK";

export const SECTION_TYPE_NAMES = [SECTION, LIST_ROOT, DICT_ROOT];
export const DEFAULT_UI_TYPE_NAME = TEXT;
export const SET_FROM_SIDEPANE = 3;
export const PROJECT_DEFAULT = 2;
export const GLOBAL_DEFAULT = 1;
export const DEFAULT_DEFAULT = 0;

export const DEFAULT_DEFAULT_UI_TYPE_ID =
  "3fdaeb6a-e989-4888-b844-17a76f0b0192";

export const DEFAULT_SECTION_UI_TYPE_ID =
  "0191cde4-3d98-4ba0-972a-fead19b8ac73";

export const DECK_UI_TYPE_ID = "0e050316-06ca-48f4-92c1-9845abdf85f7";

export function requiresNestedSection(uiTypeType) {
  return SECTION_TYPE_NAMES.includes(uiTypeType);
}

export function requiresKeyInput(sectionTypeName) {
  return sectionTypeName === DICT;
}

export function isRoot(sectionTypeName) {
  return [LIST_ROOT, DICT_ROOT, DECK].includes(sectionTypeName);
}

export function isListLike(sectionTypeName) {
  return [LIST, DICT].includes(sectionTypeName);
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
      [REF]: "Reference to Object",
    })
  )
);

export const rootTypeToChildType = { [LIST_ROOT]: LIST, [DICT_ROOT]: DICT };

export function compatibleName(type) {
  return {
    [SECTION]: SECTION,
    [LIST_ROOT]: LIST_ROOT + DICT_ROOT,
    [DICT_ROOT]: LIST_ROOT + DICT_ROOT,
  }[type];
}

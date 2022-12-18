import {
  DICT,
  DICT_ROOT,
  LIST_ROOT,
  REF,
  SECTION,
  SECTION_TYPE_NAMES,
  SLIDER,
  SWITCH,
  TEXT,
} from "abcde-utils/src/constants";

export const NO_AUTH = ["sna", "snancm"].includes(import.meta.env.MODE);
export const NO_CONTEXT_MENU = import.meta.env.MODE === "snancm";
export const BACKEND = "http://127.0.0.1:8000/";
export const SECTIONWIDTH = 450;
export const NAVBAR_HEIGHT = 64;
export const PANEID = -1;
export const DEFAULT_ENTERED_TEXT = "// write your code here";
export const OVERVIEW = "overview";
export const UI_EDITOR = "uiEditor";
export const CONTEXT_MENU = "contextMenu";
export const INDICATOR_GOTO_PARENT = "indicator_goto_parent";

export const DEFAULT_UI_TYPE_NAME = TEXT;
export const SET_FROM_SIDEPANE = 3;
export const PROJECT_DEFAULT = 2;
export const GLOBAL_DEFAULT = 1;
export const DEFAULT_DEFAULT = 0;

export function requiresNestedSection(uiTypeType) {
  return SECTION_TYPE_NAMES.includes(uiTypeType);
}

export function requiresKeyInput(sectionSubTypeName) {
  return [null, DICT].includes(sectionSubTypeName);
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

export const MIN_PANE_WIDTH = 40;

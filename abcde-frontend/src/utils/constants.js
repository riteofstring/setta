import {
  DICT,
  DICT_ROOT,
  FN,
  INFO,
  LIST_ROOT,
  OUTPUT,
  REF,
  SECTION,
  SECTION_TYPE_NAMES,
  SLIDER,
  SOCIAL,
  SWITCH,
  TEXT,
  USER_SPECIFIED_OBJECT,
} from "abcde-utils/src/constants";

export const NO_AUTH = ["sna", "snancm"].includes(import.meta.env.MODE);
export const NO_CONTEXT_MENU = import.meta.env.MODE === "snancm";
export const SECTIONWIDTH = 450;
export const NAVBAR_HEIGHT = 48;
export const PANEID = "-1";
export const OVERVIEW = "overview";
export const UI_EDITOR = "uiEditor";

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
      [OUTPUT]: "Program Output",
      [REF]: "Reference to Object",
      [INFO]: "Info",
      [SOCIAL]: "Social",
      [FN]: "Function",
      [USER_SPECIFIED_OBJECT]: "User Specified Object",
    })
  )
);

export const CLOSED_PANE_WIDTH = 40;
export const INITIAL_CHART_SIZE = { width: SECTIONWIDTH, height: SECTIONWIDTH };

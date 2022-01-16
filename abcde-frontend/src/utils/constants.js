export const NO_AUTH = process.env.REACT_APP_NO_AUTH;
export const BACKEND = "http://localhost:8000/";
export const SECTIONWIDTH = 650;
export const PANEID = -1;
export const DEFAULT_ENTERED_TEXT = "// write your code here";
export const OVERVIEW = "overview";
export const UI_EDITOR = "uiEditor";
export const CONTEXT_MENU = "contextMenu";

export const UNKNOWN = "UNKNOWN";
export const TEXT = "TEXT";
export const SLIDER = "SLIDER";
export const SWITCH = "SWITCH";
export const LIST = "LIST";
export const DICT = "DICT";
export const LIST_ROOT = "LIST_ROOT";
export const DICT_ROOT = "DICT_ROOT";
export const SECTION = "SECTION";
export const SECTION_TYPE_NAMES = [SECTION, LIST_ROOT, DICT_ROOT];
export const DEFAULT_UI_TYPE_NAME = TEXT;

export const prettyToSectionTypes = Object.freeze(
  new Map(
    Object.entries({
      Section: SECTION,
      "List of Objects": LIST_ROOT,
      "Dict of Objects": DICT_ROOT,
    })
  )
);

export const sectionTypesToPretty = new Map([
  [LIST, "Section"],
  [DICT, "Section"],
  ...Array.from(prettyToSectionTypes, (a) => a.reverse()),
]);

export function requiresNestedSection(uiTypeName) {
  return SECTION_TYPE_NAMES.includes(uiTypeName);
}

export function requiresKeyInput(sectionTypeName) {
  return sectionTypeName === DICT;
}

export function isRoot(sectionTypeName) {
  return [LIST_ROOT, DICT_ROOT].includes(sectionTypeName);
}

export function isListLike(sectionTypeName) {
  return [LIST, DICT].includes(sectionTypeName);
}

export const prettyToUITypes = Object.freeze(
  new Map(
    Object.entries({
      Text: TEXT,
      Slider: SLIDER,
      Switch: SWITCH,
      Object: SECTION,
      "List of Objects": LIST_ROOT,
      "Dict of Objects": DICT_ROOT,
    })
  )
);

export const uiTypesToPretty = new Map([
  [UNKNOWN, "Text"],
  ...Array.from(prettyToUITypes, (a) => a.reverse()),
]);

export const rootTypeToChildType = { [LIST_ROOT]: LIST, [DICT_ROOT]: DICT };

export function compatibleName(type) {
  return {
    [SECTION]: SECTION,
    [LIST_ROOT]: LIST_ROOT + DICT_ROOT,
    [DICT_ROOT]: LIST_ROOT + DICT_ROOT,
  }[type];
}

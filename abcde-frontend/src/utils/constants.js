export const NO_AUTH = process.env.REACT_APP_NO_AUTH;
export const BACKEND = "http://localhost:8000/";
export const SECTIONWIDTH = 650;
export const PANEID = -1;
export const DEFAULT_ENTERED_TEXT = "// write your code here";

export const LIST = "LIST";
export const DICT = "DICT";
export const LIST_ROOT = "LIST_ROOT";
export const DICT_ROOT = "DICT_ROOT";
export const SECTION = "SECTION";
export const LIST_NESTED_OBJECT = "LIST_NESTED_OBJECT";
export const DICT_NESTED_OBJECT = "DICT_NESTED_OBJECT";

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
      Text: "TEXT",
      Slider: "SLIDER",
      Object: "NESTED_OBJECT",
      "List of Objects": "LIST_NESTED_OBJECT",
      "Dict of Objects": "DICT_NESTED_OBJECT",
    })
  )
);

export const uiTypesToPretty = new Map(
  Array.from(prettyToUITypes, (a) => a.reverse())
);

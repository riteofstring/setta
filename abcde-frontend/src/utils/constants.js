import _ from "lodash";

export const NO_AUTH = process.env.REACT_APP_NO_AUTH;
export const BACKEND = "http://localhost:8000/";
export const SECTIONWIDTH = 650;
export const PANEID = -1;
export const DEFAULT_ENTERED_TEXT = "// write your code here";

export const UNKNOWN = "UNKNOWN";
export const TEXT = "TEXT";
export const SLIDER = "SLIDER";
export const LIST = "LIST";
export const DICT = "DICT";
export const LIST_ROOT = "LIST_ROOT";
export const DICT_ROOT = "DICT_ROOT";
export const SECTION = "SECTION";

export function requiresNestedSection(uiTypeName) {
  return [SECTION, LIST_ROOT, DICT_ROOT].includes(uiTypeName);
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

export const compatibleChildren = [new Set([LIST_ROOT, DICT_ROOT])];

export function childrenAreCompatible(types) {
  console.log("compatibleChildren", compatibleChildren, types);
  return compatibleChildren.filter((x) => _.isEqual(x, types)).length > 0;
}

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
export const SECTION_TYPE_NAMES = [SECTION, LIST_ROOT, DICT_ROOT];

export const NULL_OBJ_ID = "c838c2c2-0a33-4738-8307-dd01179fbeac";
export const DEFAULT_BASE_UI_TYPE_ID = "3fdaeb6a-e989-4888-b844-17a76f0b0192";
export const DEFAULT_SECTION_UI_TYPE_ID =
  "0191cde4-3d98-4ba0-972a-fead19b8ac73";
export const DECK_UI_TYPE_ID = "0e050316-06ca-48f4-92c1-9845abdf85f7";
export const REF_UI_TYPE_ID = "0595871f-4506-4bda-b6f1-9a3864e02a68";

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

export function isSectionUIType(type) {
  return [SECTION, LIST_ROOT, DICT_ROOT, DECK].includes(type);
}

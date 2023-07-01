import { SectionUITypeType, UITypeType } from "./types/uiType";

export const TEXT = "TEXT";
export const SLIDER = "SLIDER";
export const SWITCH = "SWITCH";
export const REF = "REF";
export const SECTION = "SECTION";
export const DECK = "DECK";
export const LIST_ROOT = "LIST_ROOT";
export const DICT_ROOT = "DICT_ROOT";
export const OUTPUT = "OUTPUT";
export const INFO = "INFO";
export const SOCIAL = "SOCIAL";
export const FN = "FN";
export const USER_SPECIFIED_OBJECT = "USER_SPECIFIED_OBJECT";
export const SECTION_TYPE_NAMES = [
  SECTION,
  LIST_ROOT,
  DICT_ROOT,
  OUTPUT,
  INFO,
  SOCIAL,
  FN,
  USER_SPECIFIED_OBJECT,
];

export const NULL_OBJ_ID = "c838c2c2-0a33-4738-8307-dd01179fbeac";
export const DEFAULT_BASE_UI_TYPE_ID = "3fdaeb6a-e989-4888-b844-17a76f0b0192";
export const DEFAULT_SECTION_UI_TYPE_ID =
  "0191cde4-3d98-4ba0-972a-fead19b8ac73";
export const DECK_UI_TYPE_ID = "0e050316-06ca-48f4-92c1-9845abdf85f7";
export const REF_UI_TYPE_ID = "0595871f-4506-4bda-b6f1-9a3864e02a68";
export const FN_UI_TYPE_ID = "51470547-1f60-4933-952c-ac8745b30b22";
export const USER_SPECIFIED_OBJECT_UI_TYPE_ID =
  "e172e84a-e95e-4145-ac40-4109f806600d";

export function isRoot(sectionTypeName) {
  return [LIST_ROOT, DICT_ROOT, DECK].includes(sectionTypeName);
}

export function isListRoot(sectionTypeName) {
  return sectionTypeName === LIST_ROOT;
}

export function isSectionUIType(
  uiType: UITypeType
): uiType is SectionUITypeType {
  return [
    SECTION,
    LIST_ROOT,
    DICT_ROOT,
    DECK,
    OUTPUT,
    INFO,
    SOCIAL,
    FN,
    USER_SPECIFIED_OBJECT,
  ].includes(uiType.type);
}

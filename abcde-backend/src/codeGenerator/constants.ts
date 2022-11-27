// json prefixes
export const VARIABLE = 'V~'; // top level variable names
export const OBJ = 'O~'; // callables
export const REF = 'R~'; // reference to another variable
export const PARAM = 'P~'; // parameter names
export const STRING = 'S~'; // string value
export const NULL_OBJ_ID = 'c838c2c2-0a33-4738-8307-dd01179fbeac';
export const DECK = 'DECK';
export const LIST_ROOT = 'LIST_ROOT';
export const DICT_ROOT = 'DICT_ROOT';

export function isRoot(sectionTypeName) {
  return [LIST_ROOT, DICT_ROOT, DECK].includes(sectionTypeName);
}

export function maybeUseNullId(objInfoId) {
  return objInfoId ? objInfoId : NULL_OBJ_ID;
}

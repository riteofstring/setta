import { NULL_OBJ_ID } from "./constants";

export function maybeUseNullId(objInfoId) {
  return objInfoId ? objInfoId : NULL_OBJ_ID;
}

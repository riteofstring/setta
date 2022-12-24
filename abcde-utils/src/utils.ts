import { NULL_OBJ_ID } from "./constants";
import { v4 as uuidv4 } from "uuid";

export function maybeUseNullId(objInfoId) {
  return objInfoId ? objInfoId : NULL_OBJ_ID;
}

export function createNewId() {
  return uuidv4();
}

export function maybeNewId(x) {
  return x ? x : createNewId();
}

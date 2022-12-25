import { v4 as uuidv4 } from "uuid";
import { NULL_OBJ_ID } from "./constants";

export function maybeUseNullId(objInfoId: string) {
  return objInfoId ? objInfoId : NULL_OBJ_ID;
}

export function createNewId() {
  return uuidv4();
}

export function maybeNewId(x?: string) {
  return x ? x : createNewId();
}

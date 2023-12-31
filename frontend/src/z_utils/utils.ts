import { v4 as uuidv4, validate } from "uuid";

export function createNewId() {
  return uuidv4();
}

export function maybeNewId(x?: string) {
  return x ? x : createNewId();
}

export function isUUID(x) {
  return validate(x);
}

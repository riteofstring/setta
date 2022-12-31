import { v4 as uuidv4 } from "uuid";

export function createNewId() {
  return uuidv4();
}

export function maybeNewId(x?: string) {
  return x ? x : createNewId();
}

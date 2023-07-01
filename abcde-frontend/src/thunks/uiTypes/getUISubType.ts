import { isRoot, rootTypeToChildSubType } from "abcde-utils/src/constants";

export function getUISubType(parentUIType) {
  return parentUIType && isRoot(parentUIType.type)
    ? rootTypeToChildSubType[parentUIType.type]
    : null;
}

import {
  isSeriesRoot,
  rootTypeToChildSubType,
} from "abcde-utils/src/constants";

export function getUISubType(parentUIType, parentUISubType) {
  return parentUIType && isSeriesRoot(parentUIType.type, parentUISubType)
    ? rootTypeToChildSubType[parentUIType.type]
    : null;
}

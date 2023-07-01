import {
  isSeriesRoot,
  rootTypeToChildSubType,
} from "abcde-utils/src/constants";
import { getSectionInfo, getSectionType } from "thunks/sections/sections";

export function getUISubType(parentId) {
  if (parentId) {
    const parentUIType = getSectionType(parentId);
    const parentUISubType = getSectionInfo(parentId).uiSubType;
    if (isSeriesRoot(parentUIType.type, parentUISubType)) {
      return rootTypeToChildSubType[parentUIType.type];
    }
  }
  return null;
}

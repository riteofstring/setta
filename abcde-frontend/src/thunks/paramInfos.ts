import { requiresNestedSection } from "abcde-utils/src/constants";
import { useEnteredValues } from "models/info/enteredValues";
import { useParamInfos } from "models/info/paramInfos";
import { useSectionInfos } from "models/info/sectionInfos";
import { useUITypes } from "models/info/uiTypes";
import { getSectionInfo } from "./sections/getters";
import { maybeIncrementProjectStateVersion } from "./undo";

export function getParamEVId(sectionId, paramInfoId) {
  const { evColId } = getSectionInfo(sectionId);
  return useParamInfos.getState().x[evColId][paramInfoId];
}

export function getParamEV(sectionId, paramInfoId) {
  const evId = getParamEVId(sectionId, paramInfoId);
  return useEnteredValues.getState().x[evId];
}

export function getParamChildId(sectionId: string, paramInfoId: string) {
  const s = useSectionInfos.getState().x;
  const possibleChildren = s[sectionId].children;
  for (const c of possibleChildren) {
    if (s[c].paramInfoId === paramInfoId) {
      return c;
    }
  }
  return null;
}

export function getParamUITypeId(sectionId, paramInfoId) {
  const { uiTypeColId } = getSectionInfo(sectionId);
  return useParamInfos.getState().y[uiTypeColId][paramInfoId].uiTypeId;
}

export function getParamUIType(sectionId, paramInfoId) {
  const uiTypeId = getParamUITypeId(sectionId, paramInfoId);
  return useUITypes.getState().x[uiTypeId];
}

export function getParamIsNested(sectionId, paramInfoId) {
  const uiType = getParamUIType(sectionId, paramInfoId);
  return requiresNestedSection(uiType.type);
}

export function setParamEnteredValue({
  sectionId,
  paramInfoId,
  value,
  incrementVersion = false,
}) {
  const evId = getParamEVId(sectionId, paramInfoId);
  useEnteredValues.getState().setEnteredValue({ enteredValueId: evId, value });
  maybeIncrementProjectStateVersion(incrementVersion);
}

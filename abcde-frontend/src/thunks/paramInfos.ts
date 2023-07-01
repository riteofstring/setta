import { useEnteredValues } from "models/info/enteredValues";
import { useParamInfos } from "models/info/paramInfos";
import { useSectionInfos } from "models/info/sectionInfos";
import { useUITypes } from "models/info/uiTypes";
import { requiresNestedSection } from "utils/constants";
import { getSectionInfo } from "./sections/sections";
import { maybeIncrementProjectStateVersion } from "./undo";

export function getParamEVId(sectionId, paramInfoId) {
  const { evColId } = getSectionInfo(sectionId);
  return useParamInfos.getState().x[evColId][paramInfoId];
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

export function setParamEVAttr(
  sectionId,
  paramInfoId,
  fn,
  props,
  incrementVersion
) {
  const evId = getParamEVId(sectionId, paramInfoId);
  fn({ enteredValueId: evId, ...props });
  maybeIncrementProjectStateVersion(incrementVersion);
}

export function setParamEnteredValue({
  sectionId,
  paramInfoId,
  value,
  incrementVersion = false,
}) {
  setParamEVAttr(
    sectionId,
    paramInfoId,
    useEnteredValues.getState().setEnteredValue,
    {
      value,
    },
    incrementVersion
  );
}

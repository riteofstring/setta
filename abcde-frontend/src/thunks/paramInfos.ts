import { useEnteredValues } from "models/info/enteredValues";
import { useParamInfos } from "models/info/paramInfos";
import { useUITypes } from "models/info/uiTypes";
import { requiresNestedSection } from "utils/constants";
import { getSectionInfo } from "./sections/sections";
import { maybeIncrementProjectStateVersion } from "./undo";

export function getParamEVId(sectionId, paramInfoId) {
  const { evColId } = getSectionInfo(sectionId);
  return useParamInfos.getState().x[evColId][paramInfoId];
}

export function getParamChildId(sectionId, paramInfoId) {
  const evId = getParamEVId(sectionId, paramInfoId);
  return useEnteredValues.getState().x[evId].childId;
}

export function getParamUITypeId(sectionId, paramInfoId) {
  const { uiTypeColId } = getSectionInfo(sectionId);
  return useParamInfos.getState().y[uiTypeColId][paramInfoId];
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

export function setParamChildId({
  sectionId,
  paramInfoId,
  childId,
  incrementVersion = false,
}) {
  setParamEVAttr(
    sectionId,
    paramInfoId,
    useEnteredValues.getState().setChildId,
    {
      childId,
    },
    incrementVersion
  );
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

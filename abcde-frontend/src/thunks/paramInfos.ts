import { useEnteredValues } from "models/info/enteredValues";
import { useParamInfos } from "models/info/paramInfos";
import { useUITypes } from "models/info/uiTypes";
import { getSectionConfig } from "./sections/sections";

export function getParamEVId(sectionId, paramInfoId) {
  const { evColId } = getSectionConfig(sectionId);
  return useParamInfos.getState().x[evColId][paramInfoId];
}

export function getParamChildId(sectionId, paramInfoId) {
  const evId = getParamEVId(sectionId, paramInfoId);
  return useEnteredValues.getState().x[evId].childId;
}

export function getParamUITypeId(sectionId, paramInfoId) {
  const { uiTypeColId } = getSectionConfig(sectionId);
  return useParamInfos.getState().y[uiTypeColId][paramInfoId];
}

export function getParamUIType(sectionId, paramInfoId) {
  const uiTypeId = getParamUITypeId(sectionId, paramInfoId);
  return useUITypes.getState().x[uiTypeId];
}

export function setParamEVAttr(sectionId, paramInfoId, fn, props) {
  const evId = getParamEVId(sectionId, paramInfoId);
  fn({ enteredValueId: evId, ...props });
}

export function setParamChildId({ sectionId, paramInfoId, childId }) {
  setParamEVAttr(
    sectionId,
    paramInfoId,
    useEnteredValues.getState().setChildId,
    {
      childId,
    }
  );
}

export function setParamEnteredValue({ sectionId, paramInfoId, value }) {
  setParamEVAttr(
    sectionId,
    paramInfoId,
    useEnteredValues.getState().setEnteredValue,
    {
      value,
    }
  );
}

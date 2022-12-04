import { thunk } from "easy-peasy";
import { getSectionConfig, getSectionTypeConfig } from "./sections";

function getParamEVId(s, sectionId, paramInfoId) {
  const { evColId } = getSectionConfig(s, sectionId);
  return s.paramInfos.x[evColId]?.[paramInfoId];
}

export function getParamChildId(s, sectionId, paramInfoId) {
  const evId = getParamEVId(s, sectionId, paramInfoId);
  return s.enteredValues.x[evId]?.childId;
}

export function getParamUITypeId(s, sectionId, paramInfoId) {
  const { uiTypeColId } = getSectionTypeConfig(s, sectionId);
  return s.paramInfos.y[uiTypeColId]?.[paramInfoId];
}

export function getParamUIType(s, sectionId, paramInfoId) {
  const uiTypeId = getParamUITypeId(s, sectionId, paramInfoId);
  return s.uiTypes.x[uiTypeId];
}

export function setParamEVAttr(s, sectionId, paramInfoId, fn, props) {
  const evId = getParamEVId(s, sectionId, paramInfoId);
  fn({ enteredValueId: evId, ...props });
}

export const setParamChildId = thunk((actions, payload, helpers) => {
  const { sectionId, paramInfoId, childId } = payload;
  setParamEVAttr(
    helpers.getStoreState(),
    sectionId,
    paramInfoId,
    helpers.getStoreActions().enteredValues.setChildId,
    {
      childId,
    }
  );
});

export const setParamEnteredValue = thunk((actions, payload, helpers) => {
  const { sectionId, paramInfoId, value } = payload;
  setParamEVAttr(
    helpers.getStoreState(),
    sectionId,
    paramInfoId,
    helpers.getStoreActions().enteredValues.setEnteredValue,
    {
      value,
    }
  );
});

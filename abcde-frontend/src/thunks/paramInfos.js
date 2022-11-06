import { thunk } from "easy-peasy";
import { getSectionConfig } from "./sections";

export function getParamChildId(s, sectionId, paramInfoId) {
  const { evColId } = getSectionConfig(s, sectionId);
  const evId = s.paramInfos.x[evColId]?.[paramInfoId];
  if (evId) {
    return s.enteredValues.x[evId]?.childId;
  }
  return undefined;
}

export const setParamUITypeId = thunk((action, payload, helpers) => {
  const { sectionId, paramInfoId, uiTypeId } = payload;
  const s = helpers.getStoreState();
  const a = helpers.getStoreActions();

  const { uiTypeColId } = getSectionConfig(s, sectionId);
  a.paramInfos.setUITypeId({
    collectionId: uiTypeColId,
    paramInfoId,
    uiTypeId,
  });
});

export function getParamUITypeId(s, sectionId, paramInfoId) {
  const { uiTypeColId } = getSectionConfig(s, sectionId);
  return s.paramInfos.y[uiTypeColId]?.[paramInfoId];
}

export function getParamUIType(s, sectionId, paramInfoId) {
  const uiTypeId = getParamUITypeId(s, sectionId, paramInfoId);
  return s.uiTypes.x[uiTypeId];
}

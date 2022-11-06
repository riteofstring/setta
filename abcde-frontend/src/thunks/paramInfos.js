import { getSectionConfig } from "./sections";

export function getParamChildId(s, sectionId, paramInfoId) {
  const { evColId } = getSectionConfig(s, sectionId);
  const evId = s.paramInfos.x[evColId]?.[paramInfoId];
  if (evId) {
    return s.enteredValues.x[evId]?.childId;
  }
  return undefined;
}

export function getParamUITypeId(s, sectionId, paramInfoId) {
  const { uiTypeColId } = getSectionConfig(s, sectionId);
  return s.paramInfos.y[uiTypeColId]?.[paramInfoId];
}

export function getParamUIType(s, sectionId, paramInfoId) {
  const uiTypeId = getParamUITypeId(s, sectionId, paramInfoId);
  return s.uiTypes.x[uiTypeId];
}

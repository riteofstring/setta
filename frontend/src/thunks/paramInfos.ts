import { useParamInfos } from "models/info/paramInfos";
import { useUITypes } from "models/info/uiTypes";
import { getSectionInfo } from "./sections/getters";
import { maybeIncrementProjectStateVersion } from "./undo";
import { varControlUpdate } from "./varControl";
import { debouncedRequestTypeCheck } from "./websocket";

export function getParamEV(sectionId, paramInfoId) {
  const { evColId } = getSectionInfo(sectionId);
  return useParamInfos.getState().x[evColId].values[paramInfoId];
}

export function getParamUITypeId(sectionId, paramInfoId) {
  const { uiTypeColId } = getSectionInfo(sectionId);
  return useParamInfos.getState().y[uiTypeColId][paramInfoId].uiTypeId;
}

export function getParamUIType(sectionId, paramInfoId) {
  const uiTypeId = getParamUITypeId(sectionId, paramInfoId);
  return useUITypes.getState().x[uiTypeId];
}

export function setParamEnteredValue({
  sectionId,
  paramInfoId,
  value,
  incrementVersion = false,
}) {
  const { evColId } = getSectionInfo(sectionId);
  useParamInfos
    .getState()
    .setEnteredValue({ collectionId: evColId, paramInfoId, value });
  if (incrementVersion) {
    varControlUpdate();
  }
  maybeIncrementProjectStateVersion(incrementVersion);
  debouncedRequestTypeCheck();
}

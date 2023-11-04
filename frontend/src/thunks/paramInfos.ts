import { useParamInfos } from "models/info/paramInfos";
import { useSectionInfos } from "models/info/sectionInfos";
import { useUITypes } from "models/info/uiTypes";
import { requiresNestedSection } from "z_utils/constants";
import { getSectionInfo } from "./sections/getters";
import { maybeIncrementProjectStateVersion } from "./undo";
import { debouncedRequestTypeCheck } from "./websocket";

export function getParamEV(sectionId, paramInfoId) {
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
  maybeIncrementProjectStateVersion(incrementVersion);
  debouncedRequestTypeCheck();
}

import { useEVCols } from "state/definitions";
import { useUITypeCols } from "state/definitions/uiTypeCols";
import { useUITypes } from "state/definitions/uiTypes";
import {
  getMappedSectionDBSource,
  getSectionInfo,
} from "../getters/sectionInfo";
import { setEnteredValue } from "./evCols";
import { debouncedRequestTypeCheck } from "./typeCheck";
import { maybeIncrementProjectStateVersion } from "./undo";
import { varControlUpdate } from "./varControl";

export function getParamEV(sectionId, paramInfoId) {
  const { evColId } = getSectionInfo(sectionId);
  const dbSource = getMappedSectionDBSource(sectionId);
  return useEVCols.getState().x[dbSource][evColId].values[paramInfoId];
}

function getParamUITypeId(sectionId, paramInfoId) {
  const { uiTypeColId } = getSectionInfo(sectionId);
  return useUITypeCols.getState().y[uiTypeColId][paramInfoId].uiTypeId;
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
  const dbSource = getMappedSectionDBSource(sectionId);
  setEnteredValue({ dbSource, collectionId: evColId, paramInfoId, value });
  if (incrementVersion) {
    varControlUpdate();
  }
  maybeIncrementProjectStateVersion(incrementVersion);
  debouncedRequestTypeCheck();
}

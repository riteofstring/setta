import _ from "lodash";
import { useUITypeCols, useUITypes } from "state/definitions";
import { useGetSectionInfo } from "./useGetSectionInfo";

export function useGetParamUIType(sectionId, paramInfoId) {
  const uiTypeId = useParamUITypeId(sectionId, paramInfoId);
  return useUITypes((x) => x.x[uiTypeId], _.isEqual);
}

function useUITypeCol(sectionId, paramInfoId, key) {
  const uiTypeColId = useGetSectionInfo(sectionId, "uiTypeColId");
  return useUITypeCols((x) => x.y[uiTypeColId][paramInfoId][key]);
}

function useParamUITypeId(sectionId, paramInfoId) {
  return useUITypeCol(sectionId, paramInfoId, "uiTypeId");
}

export function useParamNonPresetUITypeIds(sectionId, paramInfoId) {
  return useUITypeCol(sectionId, paramInfoId, "nonPresetUITypeIds");
}

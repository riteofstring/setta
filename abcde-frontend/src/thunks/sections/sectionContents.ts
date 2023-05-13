import { useCodeInfo } from "models/info/codeInfo";
import { useKwargCols } from "models/info/kwargCols";
import { useSectionToParams } from "models/info/sectionToParams";
import { getSectionConfig, getSectionName } from "./sections";

function getCurrObjParamKwargInfos(sectionId) {
  const { selectedItem } = getSectionConfig(sectionId);
  const paramInfos = getParamInfos(sectionId);
  const kwargInfos = getKwargInfos(sectionId, selectedItem);
  return [...paramInfos, ...kwargInfos];
}

// TODO: get paramCollections fetching working again
function getParamInfos(sectionId) {
  const s = useSectionToParams.getState();
  const objParamInfos = s.params[sectionId];
  const paramCollections = s.paramCollections[sectionId];
  return [...objParamInfos, ...paramCollections];
}

export function getKwargIds(sectionId, objInfoId) {
  const { kwargColId } = getSectionConfig(sectionId);
  const kwargCol = useKwargCols.getState().x[kwargColId];
  return objInfoId in kwargCol ? kwargCol[objInfoId] : [];
}

function getKwargInfos(sectionId, objInfoId) {
  const kwargIds = getKwargIds(sectionId, objInfoId);
  const allCodeInfo = useCodeInfo.getState().allCodeInfo;
  return kwargIds.map((y) => allCodeInfo[y]);
}

export function getParamWithSameName(sectionId, parentId) {
  const sectionName = getSectionName(sectionId);
  const params = getCurrObjParamKwargInfos(parentId);
  for (const p of params) {
    if (sectionName === p.name) {
      return p;
    }
  }
  return null;
}

import { useCodeInfo } from "models/info/codeInfo";
import { useKwargCols } from "models/info/kwargCols";
import {
  getSectionConfig,
  getSectionName,
  getSectionTypeConfig,
} from "./sections";

export function getCurrObjParamKwargInfos(sectionId) {
  const { selectedItem } = getSectionConfig(sectionId);
  const paramInfos = getParamInfos(sectionId, selectedItem);
  const kwargInfos = getKwargInfos(sectionId, selectedItem);
  return [...paramInfos, ...kwargInfos];
}

function getParamInfos(sectionId, objInfoId) {
  const objParamInfos = useCodeInfo.getState().params[objInfoId];
  const paramCollections = getAllParamCollections(sectionId);
  return [...objParamInfos, ...paramCollections];
}

function getCollectionChildren(sectionId, type) {
  const { collections } = getSectionTypeConfig(sectionId);
  const allCol = useCodeInfo.getState()[type];
  return [].concat(...collections.map((y) => allCol[y]));
}

function getAllParamCollections(sectionId) {
  return getCollectionChildren(sectionId, "paramCollections");
}

function getKwargIds(sectionId, objInfoId) {
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

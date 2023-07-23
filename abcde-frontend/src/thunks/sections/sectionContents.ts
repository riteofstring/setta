import { FN } from "abcde-utils/src/constants";
import {
  findAllCallablesOfCallables,
  findAllCallablesOfCollections,
  findAllParameterCollections,
  findAllParameters,
} from "abcde-utils/src/getDescendants";
import { useCodeInfo } from "models/info/codeInfo";
import { useKwargCols } from "models/info/kwargCols";
import { useSectionToParams } from "models/info/sectionToParams";
import {
  getSectionInfo,
  getSectionName,
  getSectionType,
  getSectionTypeConfig,
} from "./sections";

export function getCurrObjParamKwargInfos(sectionId) {
  const { selectedItem } = getSectionInfo(sectionId);
  const paramInfos = getParamInfos(sectionId);
  const kwargInfos = getKwargInfos(sectionId, selectedItem);
  return [...paramInfos, ...kwargInfos];
}

function getParamInfos(sectionId) {
  return useSectionToParams.getState().params[sectionId] ?? [];
}

export function getKwargIds(sectionId, objInfoId) {
  const { kwargColId } = getSectionInfo(sectionId);
  const kwargCol = useKwargCols.getState().x[kwargColId];
  return kwargCol[objInfoId] ?? [];
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

function computeCollectionChildren(sectionId: string, fn) {
  const { collections } = getSectionTypeConfig(sectionId);
  return fn(useCodeInfo.getState().allCodeInfo, collections);
}

function computeAllCallables(sectionId: string) {
  const { type } = getSectionType(sectionId);
  const fn =
    type === FN ? findAllCallablesOfCallables : findAllCallablesOfCollections;
  return computeCollectionChildren(sectionId, fn);
}

function computeAllParams(sectionId: string, objInfoId: string) {
  const objParamInfos = findAllParameters(useCodeInfo.getState().allCodeInfo, [
    objInfoId,
  ]);

  const paramCollections = computeCollectionChildren(
    sectionId,
    findAllParameterCollections
  );

  return [...objParamInfos, ...paramCollections];
}

export function updateManyParamsAndCallables(sectionIds: string[]) {
  sectionIds.forEach((x) => updateParamsAndCallables(x));
}

export function updateParamsAndCallables(sectionId: string) {
  const { selectedItem } = getSectionInfo(sectionId);
  const callables = computeAllCallables(sectionId);
  const params = computeAllParams(sectionId, selectedItem);
  useSectionToParams
    .getState()
    .setCallablesAndParams({ sectionId, callables, params });
}

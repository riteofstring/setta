import { FN } from "abcde-utils/src/constants";
import {
  findAllCallablesOfCallables,
  findAllCallablesOfCollections,
  findAllParameterCollections,
  findAllParameters,
} from "abcde-utils/src/getDescendants";
import { useCodeInfo } from "models/info/codeInfo";
import { useSectionToParams } from "models/info/sectionToParams";
import {
  getSectionInfo,
  getSectionName,
  getSectionType,
  getSectionTypeConfig,
} from "./getters";

export function getCurrObjParamInfos(sectionId) {
  const { selectedItem } = getSectionInfo(sectionId);
  return getParamInfos(sectionId);
}

function getParamInfos(sectionId) {
  return useSectionToParams.getState().params[sectionId] ?? [];
}

export function getParamWithSameName(sectionId, parentId) {
  const sectionName = getSectionName(sectionId);
  const params = getCurrObjParamInfos(parentId);
  for (const p of params) {
    if (sectionName === p.name) {
      return p;
    }
  }
  return null;
}

function computeCollectionChildren(sectionId: string, fn) {
  const { collections } = getSectionTypeConfig(sectionId);
  return fn(useCodeInfo.getState().x, collections);
}

function computeAllCallables(sectionId: string) {
  const { type } = getSectionType(sectionId);
  const fn =
    type === FN ? findAllCallablesOfCallables : findAllCallablesOfCollections;
  return computeCollectionChildren(sectionId, fn);
}

function computeAllParams(sectionId: string, objInfoId: string) {
  const objParamInfos = findAllParameters(useCodeInfo.getState().x, [
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

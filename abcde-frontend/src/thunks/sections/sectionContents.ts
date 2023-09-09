import {
  findAllCallables,
  findAllParameterCollections,
  findAllParameters,
} from "abcde-utils/src/getDescendants";
import { useCodeInfo } from "models/info/codeInfo";
import { useSectionToParams } from "models/info/sectionToParams";
import {
  getSectionInfo,
  getSectionName,
  getSectionTypeConfig,
} from "./getters";

export function getParamInfos(sectionId) {
  return useSectionToParams.getState().params[sectionId] ?? [];
}

export function getParamWithSameName(sectionId, parentId) {
  const sectionName = getSectionName(sectionId);
  const params = getParamInfos(parentId);
  for (const p of params) {
    if (sectionName === p.name) {
      return p;
    }
  }
  return null;
}

function computeAllCallables(sectionId: string) {
  const { collections } = getSectionTypeConfig(sectionId);
  return findAllCallables(useCodeInfo.getState().x, collections);
}

function computeAllParams(sectionId: string, objInfoId: string) {
  const objParamInfos = findAllParameters(useCodeInfo.getState().x, [
    objInfoId,
  ]);

  const { collections } = getSectionTypeConfig(sectionId);
  const paramCollections = findAllParameterCollections(
    useCodeInfo.getState().x,
    collections
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

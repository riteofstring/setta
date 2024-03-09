import { useCodeInfo } from "models/info/codeInfo";
import { useSectionToParams } from "models/info/sectionToParams";
import {
  findAllCallables,
  findAllParametersOfCallables,
  findAllParametersOfCollections,
} from "z_utils/getDescendants";
import { getSectionInfo, getSectionTypeConfig } from "./getters";

export function getParamInfos(sectionId) {
  return useSectionToParams.getState().params[sectionId] ?? [];
}

function computeAllCallables(sectionId: string) {
  const { codeInfoId } = getSectionTypeConfig(sectionId);
  return findAllCallables(useCodeInfo.getState().x, [codeInfoId]);
}

function computeAllParams(sectionId: string, objInfoId: string) {
  const objParamInfos = objInfoId
    ? findAllParametersOfCallables(useCodeInfo.getState().x, [objInfoId])
    : [];

  const { codeInfoId } = getSectionTypeConfig(sectionId);
  const paramCollections = findAllParametersOfCollections(
    useCodeInfo.getState().x,
    [codeInfoId],
  );

  return movePinnedToFront([...objParamInfos, ...paramCollections]);
}

export function updateManyParamsAndCallables(sectionIds: string[]) {
  sectionIds.forEach((x) => updateParamsAndCallables(x));
}

export function updateParamsAndCallables(sectionId: string) {
  updateCallables(sectionId);
  updateParams(sectionId);
}

export function updateCallables(sectionId: string) {
  const callables = computeAllCallables(sectionId);
  useSectionToParams.getState().setCallables({ sectionId, callables });
}

export function updateParams(sectionId: string) {
  const { selectedItem } = getSectionInfo(sectionId);
  const params = computeAllParams(sectionId, selectedItem);
  useSectionToParams.getState().setParams({ sectionId, params });
}

function movePinnedToFront(params) {
  const pinnedObjects = [];
  const unpinnedObjects = [];

  // Separate objects into pinned and unpinned arrays
  params.forEach((p) => {
    if (p.isPinned) {
      pinnedObjects.push(p);
    } else {
      unpinnedObjects.push(p);
    }
  });

  // Concatenating the pinned and unpinned objects
  return pinnedObjects.concat(unpinnedObjects);
}

import {
  useCodeInfo,
  useSectionInfos,
  useSectionToParams,
} from "state/definitions";
import {
  findAllCallables,
  findAllParametersOfCallables,
  findAllParametersOfCollections,
} from "utils/getDescendants";
import { getSectionInfo } from "../../getters/sectionInfo";
import { updateKeywordRegex } from "../keywordRegex";
import { getSectionSelectedItem } from "../sectionVariants";

export function getParamInfos(sectionId) {
  return useSectionToParams.getState().params[sectionId] ?? [];
}

function computeAllCallables(sectionId) {
  const { codeInfoId } = getSectionInfo(sectionId);
  return findAllCallables(useCodeInfo.getState().x, [codeInfoId]);
}

function computeAllParams(sectionId, objInfoId) {
  const objParamInfos = objInfoId
    ? findAllParametersOfCallables(useCodeInfo.getState().x, [objInfoId])
    : [];

  const { codeInfoId } = getSectionInfo(sectionId);
  const paramCollections = findAllParametersOfCollections(
    useCodeInfo.getState().x,
    [codeInfoId],
  );

  return movePinnedToFront([...objParamInfos, ...paramCollections]);
}

export function updateManyParamsAndCallables(sectionIds) {
  sectionIds.forEach((x) => updateParamsAndCallables(x, false));
  updateKeywordRegex();
}

export function updateAllParams() {
  for (const k of Object.keys(useSectionInfos.getState().x)) {
    updateParams(k);
  }
}

export function updateParamsAndCallables(
  sectionId,
  doUpdateKeywordRegex = true,
) {
  updateCallables(sectionId);
  updateParams(sectionId);
  if (doUpdateKeywordRegex) {
    updateKeywordRegex();
  }
}

export function updateCallables(sectionId) {
  const callables = computeAllCallables(sectionId);
  useSectionToParams.setState((state) => {
    state.callables[sectionId] = callables;
  });
}

export function updateParams(sectionId) {
  const selectedItem = getSectionSelectedItem(sectionId);
  const params = computeAllParams(sectionId, selectedItem);
  useSectionToParams.setState((state) => {
    state.params[sectionId] = params;
  });
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

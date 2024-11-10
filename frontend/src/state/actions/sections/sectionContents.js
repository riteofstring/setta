import {
  useCodeInfo,
  useSectionInfos,
  useSectionToParamIds,
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
  const ids = useSectionToParamIds.getState().params[sectionId] ?? [];
  const cState = useCodeInfo.getState().x;
  return ids.map((x) => cState[x]);
}

function computeAllCallables(sectionId) {
  const { codeInfoId } = getSectionInfo(sectionId);
  return findAllCallables(useCodeInfo.getState().x, [codeInfoId]);
}

function computeAllParams(sectionId, objInfoId) {
  const objParamInfoIds = objInfoId
    ? findAllParametersOfCallables(useCodeInfo.getState().x, [objInfoId])
    : [];

  const { codeInfoId } = getSectionInfo(sectionId);
  const paramCollectionIds = findAllParametersOfCollections(
    useCodeInfo.getState().x,
    [codeInfoId],
  );

  return [...objParamInfoIds, ...paramCollectionIds];
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
  const callableIds = computeAllCallables(sectionId);
  useSectionToParamIds.setState((state) => {
    state.callables[sectionId] = callableIds;
  });
}

export function updateParams(sectionId) {
  const selectedItem = getSectionSelectedItem(sectionId);
  const paramIds = computeAllParams(sectionId, selectedItem);
  useSectionToParamIds.setState((state) => {
    state.params[sectionId] = paramIds;
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

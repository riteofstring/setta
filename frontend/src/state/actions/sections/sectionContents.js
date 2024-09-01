import { useCodeInfo } from "state/definitions";
import { getSectionInfo } from "state/getters/sectionInfo";
import {
  findAllParameters,
  findAllParametersOfCallables,
  findAllParametersOfCollections,
} from "utils/getDescendants";
import { getSectionSelectedItem } from "../sectionVariants";

export function getTopLevelParamIds(sectionId, codeInfoState = null) {
  const cState = codeInfoState ?? useCodeInfo.getState().x;
  const selectedItem = getSectionSelectedItem(sectionId);
  const objParamInfoIds = selectedItem
    ? findAllParametersOfCallables(cState, [selectedItem])
    : [];

  const { codeInfoId } = getSectionInfo(sectionId);
  const paramCollectionIds = findAllParametersOfCollections(cState, [
    codeInfoId,
  ]);

  return [...objParamInfoIds, ...paramCollectionIds];
}

export function getAllParamIds(sectionId, codeInfoState = null) {
  const cState = codeInfoState ?? useCodeInfo.getState().x;
  const topLevelIds = getTopLevelParamIds(sectionId, cState);
  return findAllParameters(cState, topLevelIds);
}

export function getAllParamInfos(sectionId, codeInfoState = null) {
  const ids = getAllParamIds(sectionId, codeInfoState);
  return ids.map((x) => codeInfoState[x]);
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

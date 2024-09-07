import { useCodeInfo } from "state/definitions";
import { getSectionInfo } from "state/getters/sectionInfo";
import {
  findAllParameters,
  findAllParametersOfCallables,
  findAllParametersOfCollections,
} from "utils/getDescendants";
import { getSectionSelectedItem } from "../sectionVariants";

export function getParamIds(
  sectionId,
  _cState = null,
  _selectedItem = undefined,
  _codeInfoId = null,
  allParams = false,
  includePaths = false,
) {
  const cState = _cState ?? useCodeInfo.getState().x;
  const selectedItem =
    _selectedItem === undefined
      ? getSectionSelectedItem(sectionId)
      : _selectedItem;
  const objParamInfoIds = selectedItem
    ? findAllParametersOfCallables(cState, [selectedItem], includePaths)
    : [];

  const codeInfoId = _codeInfoId ?? getSectionInfo(sectionId).codeInfoId;
  const paramCollectionIds = allParams
    ? findAllParameters(cState, [codeInfoId], includePaths)
    : findAllParametersOfCollections(cState, [codeInfoId], includePaths);

  return [...objParamInfoIds, ...paramCollectionIds];
}

export function getAllParamIds(
  sectionId,
  _cState = null,
  _selectedItem = undefined,
  _codeInfoId = null,
  includePaths = false,
) {
  return getParamIds(
    sectionId,
    _cState,
    _selectedItem,
    _codeInfoId,
    true,
    includePaths,
  );
}

export function getAllParamInfos(sectionId, _cState = null) {
  const cState = _cState ?? useCodeInfo.getState().x;
  const ids = getAllParamIds(sectionId, cState);
  return ids.map((x) => cState[x]);
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

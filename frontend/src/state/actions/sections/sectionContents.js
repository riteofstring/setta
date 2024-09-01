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
) {
  const cState = _cState ?? useCodeInfo.getState().x;
  const selectedItem =
    _selectedItem === undefined
      ? getSectionSelectedItem(sectionId)
      : _selectedItem;
  const objParamInfoIds = selectedItem
    ? findAllParametersOfCallables(cState, [selectedItem])
    : [];

  const codeInfoId = _codeInfoId ?? getSectionInfo(sectionId).codeInfoId;
  const paramCollectionIds = allParams
    ? findAllParameters(cState, [codeInfoId])
    : findAllParametersOfCollections(cState, [codeInfoId]);

  return [...objParamInfoIds, ...paramCollectionIds];
}

export function getAllParamIds(
  sectionId,
  _cState = null,
  _selectedItem = undefined,
  _codeInfoId = null,
) {
  return getParamIds(
    sectionId,
    _cState,
    _selectedItem,
    _codeInfoId,
    true,
  );
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

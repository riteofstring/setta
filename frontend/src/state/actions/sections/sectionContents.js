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
  paramPathCondition = false,
) {
  const cState = _cState ?? useCodeInfo.getState().x;
  const selectedItem =
    _selectedItem === undefined
      ? getSectionSelectedItem(sectionId)
      : _selectedItem;
  const objParamInfoIds = selectedItem
    ? findAllParametersOfCallables(cState, [selectedItem], paramPathCondition)
    : [];

  const codeInfoId = _codeInfoId ?? getSectionInfo(sectionId).codeInfoId;
  const paramCollectionIds = allParams
    ? findAllParameters(cState, [codeInfoId], paramPathCondition)
    : findAllParametersOfCollections(cState, [codeInfoId], paramPathCondition);

  return [...objParamInfoIds, ...paramCollectionIds];
}

export function getAllParamIds(
  sectionId,
  _cState = null,
  _selectedItem = undefined,
  _codeInfoId = null,
  paramPathCondition = false,
) {
  return getParamIds(
    sectionId,
    _cState,
    _selectedItem,
    _codeInfoId,
    true,
    paramPathCondition,
  );
}

export function getAllParamInfos(sectionId, _cState = null) {
  const cState = _cState ?? useCodeInfo.getState().x;
  const ids = getAllParamIds(sectionId, cState);
  return ids.map((x) => cState[x]);
}

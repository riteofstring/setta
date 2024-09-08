import C from "constants/constants.json";
import { useCodeInfo } from "state/definitions";
import { getSectionInfo } from "state/getters/sectionInfo";
import {
  findAllParametersOfCallables,
  findAllParametersOfNotCallables,
} from "utils/getDescendants";
import { bothTruthyOrFalsey } from "utils/utils";
import { getSectionSelectedItem } from "../sectionVariants";

export function getParamIds(
  sectionId,
  _cState = null,
  _selectedItem = undefined,
  _codeInfoId = null,
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

  if (!selectedItem) {
    const codeInfoId = _codeInfoId ?? getSectionInfo(sectionId).codeInfoId;
    const paramCollectionIds = findAllParametersOfNotCallables(
      cState,
      [codeInfoId],
      paramPathCondition,
    );
    return [...objParamInfoIds, ...paramCollectionIds];
  } else {
    return objParamInfoIds;
  }
}

export function getParamInfos(sectionId, _cState = null) {
  const cState = _cState ?? useCodeInfo.getState().x;
  const ids = getParamIds(sectionId, cState);
  return ids.map((x) => cState[x]);
}

export function getParamIdsToShowInArea(
  sectionId,
  isPinned,
  _cState = null,
  _selectedItem = null,
  _codeInfoId = null,
) {
  const cState = _cState ?? useCodeInfo.getState().x;
  const selectedItem = _selectedItem ?? getSectionInfo(sectionId).selectedItem;
  const codeInfoId = _codeInfoId ?? getSectionInfo(sectionId).codeInfoId;

  const allIdsAndPaths = getParamIds(
    sectionId,
    cState,
    selectedItem,
    codeInfoId,
    (p) => p.rcType === C.PARAMETER,
  );
  allIdsAndPaths.reverse();

  let topLevelParamIds = [];
  const topLevelParamIdsSet = new Set();
  let requiredParamIds = new Set();
  for (const a of allIdsAndPaths) {
    // Evalutes to true if:
    // 1. The current param's isPinned matches the isPinned condition
    // 2. And: either the param has no children or at least one of its children is required
    // This logic is why it's REQUIRED for allIdsAndPaths to be reversed (processed starting with children up to ancestors)
    if (
      bothTruthyOrFalsey(cState[a.id].isPinned, isPinned) &&
      (cState[a.id].children.length === 0 ||
        cState[a.id].children.some((child) => requiredParamIds.has(child)))
    ) {
      for (const p of a.path) {
        requiredParamIds.add(p);
        if (!topLevelParamIdsSet.has(a.path[0])) {
          topLevelParamIds.push(a.path[0]);
          topLevelParamIdsSet.add(a.path[0]);
        }
      }
    }
  }

  // unreverse results
  topLevelParamIds.reverse();

  return { requiredParamIds, topLevelParamIds };
}

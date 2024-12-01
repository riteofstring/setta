import C from "constants/constants.json";
import { useSectionInfos } from "state/definitions";
import {
  findAllParametersOfCallables,
  findAllParametersOfNotCallables,
} from "utils/getDescendants";
import { bothTruthyOrFalsey } from "utils/utils";
import { getSectionCodeInfoChildren } from "../codeInfoCols";
import { getSectionVariant } from "../sectionInfos";

export function getParamIds(
  sectionId,
  _cState = null,
  _codeInfoChildren = null,
  _selectedItem = undefined,
  paramPathCondition = false,
) {
  const cState = _cState ?? useSectionInfos.getState().codeInfo;
  const codeInfoChildren =
    _codeInfoChildren ?? getSectionCodeInfoChildren(sectionId);
  const selectedItem =
    _selectedItem === undefined
      ? getSectionVariant(sectionId).selectedItem
      : _selectedItem;

  const fn = selectedItem
    ? findAllParametersOfCallables
    : findAllParametersOfNotCallables;

  const codeInfoIds = selectedItem
    ? [selectedItem]
    : codeInfoChildren[selectedItem];

  return fn(cState, codeInfoChildren, codeInfoIds ?? [], paramPathCondition);
}

export function getParamInfos(sectionId, _cState = null) {
  const cState = _cState ?? useSectionInfos.getState().codeInfo;
  const { ids } = getParamIds(sectionId, cState);
  return ids.map((x) => cState[x]);
}

export function getParamIdsToShowInArea(
  sectionId,
  isPinned,
  _cState = null,
  _codeInfoChildren = null,
  _selectedItem = undefined,
) {
  const cState = _cState ?? useSectionInfos.getState().codeInfo;
  const codeInfoChildren =
    _codeInfoChildren ?? getSectionCodeInfoChildren(sectionId);

  const { ids, pathMap } = getParamIds(
    sectionId,
    cState,
    codeInfoChildren,
    _selectedItem,
    (p) => p.rcType === C.PARAMETER,
  );
  ids.reverse();

  let topLevelParamIds = [];
  const topLevelParamIdsSet = new Set();
  const requiredParamIdsToPaths = {};
  for (const a of ids) {
    // Evalutes to true if:
    // 1. The current param's isPinned matches the isPinned condition
    // 2. And: either the param has no children or at least one of its children is required
    // This logic is why it's REQUIRED for ids to be reversed (processed starting with children up to ancestors)
    if (
      bothTruthyOrFalsey(cState[a].isPinned, isPinned) &&
      (codeInfoChildren[a].length === 0 ||
        codeInfoChildren[a].some((child) => child in requiredParamIdsToPaths))
    ) {
      for (const p of pathMap[a]) {
        requiredParamIdsToPaths[p] = pathMap[p];
        if (!topLevelParamIdsSet.has(pathMap[a][0])) {
          topLevelParamIds.push(pathMap[a][0]);
          topLevelParamIdsSet.add(pathMap[a][0]);
        }
      }
    }
  }

  // unreverse results
  topLevelParamIds.reverse();

  return { requiredParamIdsToPaths, topLevelParamIds };
}

export function paramNameFromPathArray(codeInfo, pathMap, paramId) {
  if (pathMap[paramId].length === 1) {
    return codeInfo[pathMap[paramId][0]].name;
  } else {
    let name = "";
    for (const [pathIdx, currId] of pathMap[paramId].entries()) {
      if (pathIdx === 0) {
        name = codeInfo[currId].name;
      } else {
        name += `["${codeInfo[currId].name}"]`;
      }
    }
    return name;
  }
}

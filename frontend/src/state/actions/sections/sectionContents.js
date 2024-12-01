import C from "constants/constants.json";
import { useSectionInfos } from "state/definitions";
import {
  findAllParametersOfCallables,
  findAllParametersOfNotCallables,
} from "utils/getDescendants";
import { bothTruthyOrFalsey } from "utils/utils";
import { getSectionCodeInfoChildren, getSectionVariant } from "../sectionInfos";

export function getParamIds(
  sectionId,
  _state,
  _codeInfoChildren,
  _selectedItem = undefined,
  paramPathCondition = false,
) {
  const state = _state ?? useSectionInfos.getState();
  const codeInfoChildren =
    _codeInfoChildren ?? getSectionCodeInfoChildren(sectionId);
  const selectedItem =
    _selectedItem === undefined
      ? getSectionVariant(sectionId, state).selectedItem
      : _selectedItem;

  const fn = selectedItem
    ? findAllParametersOfCallables
    : findAllParametersOfNotCallables;

  const codeInfoIds = selectedItem
    ? [selectedItem]
    : codeInfoChildren[selectedItem];

  return fn(
    state.codeInfo,
    codeInfoChildren,
    codeInfoIds ?? [],
    paramPathCondition,
  );
}

export function getParamInfos(sectionId, _state) {
  const state = _state ?? useSectionInfos.getState();
  const { ids } = getParamIds(sectionId, state);
  return ids.map((x) => state.codeInfo[x]);
}

export function getParamIdsToShowInArea(
  sectionId,
  isPinned,
  _state,
  _codeInfoChildren,
  _selectedItem = undefined,
) {
  const state = _state ?? useSectionInfos.getState();
  const codeInfoChildren =
    _codeInfoChildren ?? getSectionCodeInfoChildren(sectionId);

  const { ids, pathMap } = getParamIds(
    sectionId,
    state,
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
      bothTruthyOrFalsey(state.codeInfo[a].isPinned, isPinned) &&
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

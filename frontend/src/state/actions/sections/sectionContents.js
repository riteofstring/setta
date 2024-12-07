import C from "constants/constants.json";
import { useSectionInfos } from "state/definitions";
import { findAllParameters } from "utils/getDescendants";
import { bothTruthyOrFalsey } from "utils/utils";
import { getCodeInfoCol, getSectionVariant } from "../sectionInfos";

export function getParamIds(
  sectionId,
  _state,
  _codeInfoChildren,
  _parentCodeInfoId = undefined,
  paramPathCondition = false,
) {
  const state = _state ?? useSectionInfos.getState();
  const codeInfoChildren =
    _codeInfoChildren ?? getCodeInfoCol(sectionId, state).children;
  const parentCodeInfoId =
    _parentCodeInfoId === undefined
      ? getSectionVariant(sectionId, state).selectedItem
      : _parentCodeInfoId;

  const codeInfoIds = parentCodeInfoId
    ? [parentCodeInfoId]
    : codeInfoChildren[null];

  return findAllParameters(
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
  _parentCodeInfoId = undefined,
) {
  const state = _state ?? useSectionInfos.getState();
  const codeInfoChildren =
    _codeInfoChildren ?? getCodeInfoCol(sectionId, state).children;

  const { ids, pathMap } = getParamIds(
    sectionId,
    state,
    codeInfoChildren,
    _parentCodeInfoId,
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

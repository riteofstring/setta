import C from "constants/constants.json";
import {
  findAllParameters,
  findAllParametersAndPathMaps,
} from "utils/getDescendants";
import { bothTruthyOrFalsey } from "utils/utils";
import { getCodeInfoCol, getSectionVariant } from "../sectionInfos";

export function getParamIdsToShowInArea(
  isPinned,
  codeInfo,
  codeInfoChildren,
  parentCodeInfoId,
  startAtDepth = 0,
) {
  const { ids, pathMap } = findAllParametersAndPathMaps({
    allCodeInfo: codeInfo,
    codeInfoChildren,
    startingId: parentCodeInfoId,
  });
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
      bothTruthyOrFalsey(codeInfo[a].isPinned, isPinned) &&
      (codeInfoChildren[a].length === 0 ||
        codeInfoChildren[a].some((child) => child in requiredParamIdsToPaths))
    ) {
      for (const p of pathMap[a]) {
        if (startAtDepth > 0) {
          if (startAtDepth < pathMap[p].length) {
            requiredParamIdsToPaths[p] = pathMap[p].slice(startAtDepth);
          }
        } else {
          requiredParamIdsToPaths[p] = pathMap[p];
        }
        if (
          pathMap[a][startAtDepth] &&
          !topLevelParamIdsSet.has(pathMap[a][startAtDepth])
        ) {
          topLevelParamIds.push(pathMap[a][startAtDepth]);
          topLevelParamIdsSet.add(pathMap[a][startAtDepth]);
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

function getSectionHasSomeParamCondition(sectionId, state, condition) {
  const { selectedItem } = getSectionVariant(sectionId, state);
  const codeInfoChildren = getCodeInfoCol(sectionId, state).children;

  const { earlyReturnTriggered } = findAllParameters({
    allCodeInfo: state.codeInfo,
    codeInfoChildren,
    startingId: selectedItem,
    earlyReturnCondition: condition,
  });

  return earlyReturnTriggered;
}

export function getSectionHasParams(sectionId, state) {
  return getSectionHasSomeParamCondition(sectionId, state, (c) => {
    return c?.rcType === C.PARAMETER;
  });
}

export function getSectionHasAtLeastOneSelectedParam(sectionId, state) {
  return getSectionHasSomeParamCondition(sectionId, state, (c) => {
    return c?.isSelected;
  });
}

import C from "constants/constants.json";
import _ from "lodash";
import { useSectionInfos } from "state/definitions";
import {
  findAllParameters,
  findAllParametersAndPathMaps,
} from "utils/getDescendants";
import { bothTruthyOrFalsey } from "utils/utils";
import {
  getCodeChildrenAndParentCodeInfoId,
  getCodeInfoCol,
  getSectionType,
  getSectionVariant,
} from "../sectionInfos";

export function getParamIdsToShowInArea(
  isPinned,
  codeInfo,
  codeInfoChildren,
  parentCodeInfoId,
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

export function getAllVisibleParamsInSection(sectionId, state) {
  const { hideUnpinnedParams } = state.x[sectionId];
  const { codeInfoChildren, parentCodeInfoId } =
    getCodeChildrenAndParentCodeInfoId(sectionId, state);
  let pinnedIds = getParamIdsToShowInArea(
    true,
    state.codeInfo,
    codeInfoChildren,
    parentCodeInfoId,
  );

  pinnedIds = Object.keys(pinnedIds.requiredParamIdsToPaths);
  pinnedIds.reverse();

  let unpinnedIds = [];
  if (!hideUnpinnedParams) {
    unpinnedIds = getParamIdsToShowInArea(
      false,
      state.codeInfo,
      codeInfoChildren,
      parentCodeInfoId,
    );
    unpinnedIds = Object.keys(unpinnedIds.requiredParamIdsToPaths);
    unpinnedIds.reverse();
  }

  return [...pinnedIds, ...unpinnedIds];
}

/**
 * Gets the current code info for a section. This means the callable's id, (if there's one), its name, its documentation, and the same information for its parameters (if it has any)
 * @SETTA_MCP_TOOL
 * @param {ID} sectionId
 * @return {SectionSimplifiedCodeInfo}
 */
export function getSectionCurrentCodeInfoMcp({ sectionId }) {
  const state = useSectionInfos.getState();
  const { codeInfoChildren, parentCodeInfoId } =
    getCodeChildrenAndParentCodeInfoId(sectionId, state);

  let callableInfo = {};
  if (parentCodeInfoId) {
    callableInfo = _.pick(state.codeInfo[parentCodeInfoId], [
      "id",
      "name",
      "description",
    ]);
  }
  const paramInfos = codeInfoChildren[parentCodeInfoId].map((x) =>
    _.pick(state.codeInfo[x], ["id", "name", "description"]),
  );

  return { callableInfo, paramInfos };
}

/**
 * Gets information about all the sections that currently exist.
 * @SETTA_MCP_TOOL
 * @returns {Object<ID, SimplifiedSectionInfo>} An object that maps from sectionId to that section's information.
 */
export function getAllSectionInformationMcp() {
  const state = useSectionInfos.getState();
  const output = {};
  for (const s of Object.values(state.x)) {
    output[s.id] = {
      name: s.name,
      type: getSectionType(s.id, state),
      codeInfo: getSectionCurrentCodeInfoMcp({ sectionId: s.id }),
    };
  }
  return output;
}

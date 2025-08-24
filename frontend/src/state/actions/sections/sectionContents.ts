import { ZustandProjectState } from "state/definitions";
import {
  BaseSectionImplUnion,
  isBaseParamCodeObjImpl,
  isBaseSectionWithParamsImpl,
} from "utils/generatedTypes";
import {
  CodeObjPathMap,
  findAllParameters,
  findAllParametersOfSection,
} from "utils/getDescendants";
import {
  getCurrEffectiveSectionImpl,
  getSectionVariant,
} from "../sectionInfos";

export function getParamIdsToShowInArea(
  p: ZustandProjectState,
  impl: BaseSectionImplUnion,
  isPinned: boolean,
) {
  if (!isBaseSectionWithParamsImpl(impl)) {
    throw new Error();
  }
  const { ids, pathMap, childrenMap } = findAllParametersOfSection(p, impl, {
    output: isBaseParamCodeObjImpl,
    paramPath: isBaseParamCodeObjImpl,
  });
  ids.reverse();

  const topLevelParamIds: Array<string> = [];
  const topLevelParamIdsSet: Set<string> = new Set();
  const requiredParamIdsToPaths: Record<string, Array<string>> = {};
  for (const a of ids) {
    // Evalutes to true if:
    // 1. The current param's isPinned matches the isPinned condition
    // 2. And: either the param has no children or at least one of its children is required
    // This logic is why it's REQUIRED for ids to be reversed (processed starting with children up to ancestors)
    if (
      impl.pinnedParams.includes(a) === isPinned &&
      (!childrenMap[a] ||
        childrenMap[a].length === 0 ||
        childrenMap[a].some((child) => child in requiredParamIdsToPaths))
    ) {
      const currPathMap = pathMap[a];
      if (!currPathMap) {
        throw new Error();
      }
      for (const p of currPathMap) {
        requiredParamIdsToPaths[p] = pathMap[p] ?? [];
        if (currPathMap[0] && !topLevelParamIdsSet.has(currPathMap[0])) {
          topLevelParamIds.push(currPathMap[0]);
          topLevelParamIdsSet.add(currPathMap[0]);
        }
      }
    }
  }

  // unreverse results
  topLevelParamIds.reverse();

  return { requiredParamIdsToPaths, topLevelParamIds };
}

export function paramNameFromPathArray(
  codeObjs: ZustandProjectState["codeObjs"],
  pathMap: CodeObjPathMap,
  paramId: string,
) {
  const currPath = pathMap[paramId];
  if (currPath.length === 1) {
    return codeObjs[currPath[0]].name;
  } else {
    let name = "";
    for (const [pathIdx, currId] of pathMap[paramId].entries()) {
      if (pathIdx === 0) {
        name = codeObjs[currId].name;
      } else {
        name += `["${codeObjs[currId].name}"]`;
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
    return c?.rcType === CodeInfoTypeEnum.PARAMETER;
  });
}

export function getSectionHasAtLeastOneSelectedParam(sectionId, state) {
  return getSectionHasSomeParamCondition(sectionId, state, (c) => {
    return c?.isSelected;
  });
}

export function getAllVisibleParamsInSection(
  state: ZustandProjectState,
  sectionId: string,
): Array<string> {
  const impl = getCurrEffectiveSectionImpl(state, sectionId);
  if (!isBaseSectionWithParamsImpl(impl)) {
    return [];
  }

  const pinnedParams = getParamIdsToShowInArea(state, impl, true);

  const pinnedIds = Object.keys(pinnedParams.requiredParamIdsToPaths);
  pinnedIds.reverse();

  let unpinnedIds: Array<string> = [];
  if (!impl.hideUnpinnedParams) {
    const unpinnedParams = getParamIdsToShowInArea(state, impl, false);
    unpinnedIds = Object.keys(unpinnedParams.requiredParamIdsToPaths);
    unpinnedIds.reverse();
  }

  return [...pinnedIds, ...unpinnedIds];
}

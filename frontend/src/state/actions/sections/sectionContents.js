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

  const { ids: objParamInfoIds, pathMap: objParamPathMap } = selectedItem
    ? findAllParametersOfCallables(cState, [selectedItem], paramPathCondition)
    : { ids: [], pathMap: {} };

  if (!selectedItem) {
    const codeInfoId = _codeInfoId ?? getSectionInfo(sectionId).codeInfoId;
    const { ids: paramCollectionIds, pathMap: paramPathMap } =
      findAllParametersOfNotCallables(cState, [codeInfoId], paramPathCondition);
    return {
      ids: [...objParamInfoIds, ...paramCollectionIds],
      pathMap: { ...objParamPathMap, ...paramPathMap },
    };
  } else {
    return { ids: objParamInfoIds, pathMap: objParamPathMap };
  }
}

export function getParamInfos(sectionId, _cState = null) {
  const cState = _cState ?? useCodeInfo.getState().x;
  const { ids } = getParamIds(sectionId, cState);
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

  const { ids, pathMap } = getParamIds(
    sectionId,
    cState,
    selectedItem,
    codeInfoId,
    (p) => p.rcType === C.PARAMETER,
  );
  ids.reverse();

  let topLevelParamIds = [];
  const topLevelParamIdsSet = new Set();
  let requiredParamIds = new Set();
  for (const a of ids) {
    // Evalutes to true if:
    // 1. The current param's isPinned matches the isPinned condition
    // 2. And: either the param has no children or at least one of its children is required
    // This logic is why it's REQUIRED for ids to be reversed (processed starting with children up to ancestors)
    if (
      bothTruthyOrFalsey(cState[a].isPinned, isPinned) &&
      (cState[a].children.length === 0 ||
        cState[a].children.some((child) => requiredParamIds.has(child)))
    ) {
      for (const p of pathMap[a]) {
        requiredParamIds.add(p);
        if (!topLevelParamIdsSet.has(pathMap[a][0])) {
          topLevelParamIds.push(pathMap[a][0]);
          topLevelParamIdsSet.add(pathMap[a][0]);
        }
      }
    }
  }

  // unreverse results
  topLevelParamIds.reverse();

  return { requiredParamIds, topLevelParamIds };
}

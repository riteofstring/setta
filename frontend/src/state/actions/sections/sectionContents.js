import C from "constants/constants.json";
import { useCodeInfo } from "state/definitions";
import {
  findAllParametersOfCallables,
  findAllParametersOfNotCallables,
} from "utils/getDescendants";
import { bothTruthyOrFalsey } from "utils/utils";
import { getSectionCodeInfoChildren } from "../codeInfoCols";
import { getSectionSelectedItem } from "../sectionVariants";

export function getParamIds(
  sectionId,
  _cState = null,
  _codeInfoChildren = null,
  _selectedItem = undefined,
  paramPathCondition = false,
) {
  const cState = _cState ?? useCodeInfo.getState().x;
  const codeInfoChildren =
    _codeInfoChildren ?? getSectionCodeInfoChildren(sectionId);
  const selectedItem =
    _selectedItem === undefined
      ? getSectionSelectedItem(sectionId)
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
  const cState = _cState ?? useCodeInfo.getState().x;
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
  const cState = _cState ?? useCodeInfo.getState().x;
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

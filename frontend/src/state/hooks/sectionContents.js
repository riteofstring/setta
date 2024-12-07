import C from "constants/constants.json";
import _ from "lodash";
import { getDisplayedSectionVariant } from "state/actions/sectionInfos";
import {
  getParamIds,
  getParamIdsToShowInArea,
  paramNameFromPathArray,
} from "state/actions/sections/sectionContents";
import { useSectionInfos } from "state/definitions";
import { createJSONSourceParamId } from "utils/idNameCreation";
import { newUITypeColEntry } from "utils/objs/uiTypeCol";

export function useParamInfosForSidePane(sectionId) {
  return useSectionInfos((x) => {
    const { codeInfoChildren, parentCodeInfoId } =
      getCodeChildrenAndParentCodeInfoId(sectionId, x);
    const { ids, pathMap } = getParamIds(
      sectionId,
      x,
      codeInfoChildren,
      parentCodeInfoId,
      (p) => p.rcType === C.PARAMETER,
    );
    const output = [];
    for (const id of ids) {
      output.push({
        id,
        name: paramNameFromPathArray(x.codeInfo, pathMap, id),
      });
    }
    return output;
  }, _.isEqual);
}

export function useParamIdsToShowInArea(sectionId, isPinned) {
  return useSectionInfos((x) => {
    const { codeInfoChildren, parentCodeInfoId, startAtDepth } =
      getCodeChildrenAndParentCodeInfoId(sectionId, x);
    return getParamIdsToShowInArea(
      sectionId,
      isPinned,
      x,
      codeInfoChildren,
      parentCodeInfoId,
      startAtDepth,
    );
  }, _.isEqual);
}

export function getCodeChildrenAndParentCodeInfoId(sectionId, x) {
  const sectionVariant = getDisplayedSectionVariant(sectionId, x);
  const { codeInfoColId } = sectionVariant;

  let parentCodeInfoId,
    startAtDepth = 0;
  const { jsonSource, jsonSourceKeys } = x.x[sectionId];
  if (
    jsonSource &&
    Array.isArray(jsonSourceKeys) &&
    jsonSourceKeys.length > 0
  ) {
    parentCodeInfoId = createJSONSourceParamId(jsonSourceKeys, jsonSource);
    startAtDepth = jsonSourceKeys.length;
  } else {
    parentCodeInfoId = sectionVariant.selectedItem;
  }

  const codeInfoChildren = codeInfoColId
    ? x.codeInfoCols[codeInfoColId].children
    : newUITypeColEntry();

  return { codeInfoChildren, parentCodeInfoId, startAtDepth };
}

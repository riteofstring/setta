import _ from "lodash";
import { getCodeChildrenAndParentCodeInfoId } from "state/actions/sectionInfos";
import {
  getParamIdsToShowInArea,
  paramNameFromPathArray,
} from "state/actions/sections/sectionContents";
import { useSectionInfos } from "state/definitions";
import { findAllParametersAndPathMaps } from "utils/getDescendants";

export function useParamInfosForSidePane(sectionId) {
  return useSectionInfos((x) => {
    const { codeInfoChildren, parentCodeInfoId } =
      getCodeChildrenAndParentCodeInfoId(sectionId, x);
    const { ids, pathMap } = findAllParametersAndPathMaps(
      x.codeInfo,
      codeInfoChildren,
      parentCodeInfoId,
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

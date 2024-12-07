import C from "constants/constants.json";
import _ from "lodash";
import { getDisplayedSectionVariant } from "state/actions/sectionInfos";
import {
  getParamIds,
  getParamIdsToShowInArea,
  paramNameFromPathArray,
} from "state/actions/sections/sectionContents";
import { useSectionInfos } from "state/definitions";
import { newCodeInfoCol } from "utils/objs/codeInfoCol";

export function useParamInfosForSidePane(sectionId) {
  return useSectionInfos((x) => {
    const { selectedItem, codeInfoColId } = getDisplayedSectionVariant(
      sectionId,
      x,
    );
    const codeInfoChildren = x.codeInfoCols[codeInfoColId].children;

    const { ids, pathMap } = getParamIds(
      sectionId,
      x,
      codeInfoChildren,
      selectedItem,
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
    const { selectedItem, codeInfoColId } = getDisplayedSectionVariant(
      sectionId,
      x,
    );
    const codeInfoChildren = codeInfoColId
      ? x.codeInfoCols[codeInfoColId].children
      : newCodeInfoCol().children;
    return getParamIdsToShowInArea(
      sectionId,
      isPinned,
      x,
      codeInfoChildren,
      selectedItem,
    );
  }, _.isEqual);
}

import C from "constants/constants.json";
import _ from "lodash";
import {
  getParamIds,
  getParamIdsToShowInArea,
  paramNameFromPathArray,
} from "state/actions/sections/sectionContents";
import { getSectionVariantToShow } from "state/actions/sectionVariants";
import { useSectionInfos } from "state/definitions";
import { useSectionCodeInfoChildren } from "./codeInfoCols";

export function useParamInfosForSidePane(sectionId) {
  return useSectionInfos((x) => {
    const { selectedItem, codeInfoColId } = getSectionVariantToShow(
      sectionId,
      x,
    );
    const codeInfoChildren = x.codeInfoCols[codeInfoColId].children;

    const { ids, pathMap } = getParamIds(
      sectionId,
      x.codeInfo,
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
  const codeInfoChildren = useSectionCodeInfoChildren(sectionId);

  return useSectionInfos((x) => {
    const selectedItem = getSectionVariantToShow(sectionId, x).selectedItem;
    return getParamIdsToShowInArea(
      sectionId,
      isPinned,
      x.codeInfo,
      codeInfoChildren,
      selectedItem,
    );
  }, _.isEqual);
}

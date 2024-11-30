import _ from "lodash";
import {
  getParamIds,
  getParamIdsToShowInArea,
} from "state/actions/sections/sectionContents";
import { getSectionVariantToShow } from "state/actions/sectionVariants";
import { useSectionInfos } from "state/definitions";
import { useSectionCodeInfoChildren } from "./codeInfoCols";
import { useSectionSelectedItem } from "./sectionVariants";

export function useParamInfosForSidePane(sectionId) {
  return useSectionInfos((x) => {
    const { selectedItem, codeInfoColId } = getSectionVariantToShow(
      sectionId,
      x,
    );
    const codeInfoChildren = x.codeInfoCols[codeInfoColId].children;

    const { ids } = getParamIds(
      sectionId,
      x.codeInfo,
      codeInfoChildren,
      selectedItem,
    );
    const output = [];
    for (const id of ids) {
      output.push(x.codeInfo[id]);
    }
    return output;
  }, _.isEqual);
}

export function useParamIdsToShowInArea(sectionId, isPinned) {
  const selectedItem = useSectionSelectedItem(sectionId);
  const codeInfoChildren = useSectionCodeInfoChildren(sectionId);

  return useSectionInfos((x) => {
    return getParamIdsToShowInArea(
      sectionId,
      isPinned,
      x.codeInfo,
      codeInfoChildren,
      selectedItem,
    );
  }, _.isEqual);
}

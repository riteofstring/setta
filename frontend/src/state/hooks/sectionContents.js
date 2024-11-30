import _ from "lodash";
import {
  getParamIds,
  getParamIdsToShowInArea,
} from "state/actions/sections/sectionContents";
import { useSectionInfos } from "state/definitions";
import { useSectionCodeInfoChildren } from "./codeInfoCols";
import { useSectionSelectedItem } from "./sectionVariants";

export function useGetParamInfosThatHaveNames(sectionId) {
  const selectedItem = useSectionSelectedItem(sectionId);
  const codeInfoChildren = useSectionCodeInfoChildren(sectionId);

  return useSectionInfos((x) => {
    const { ids } = getParamIds(
      sectionId,
      x.codeInfo,
      codeInfoChildren,
      selectedItem,
    );
    const haveName = [];
    for (const id of ids) {
      if (x.codeInfo[id].name) {
        haveName.push(x.codeInfo[id]);
      }
    }
    return haveName;
  }, _.isEqual);
}

export function useHasParams(sectionId) {
  return useSectionInfos(
    (x) => getParamIds(sectionId, x.codeInfo)["ids"].length > 0,
  );
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

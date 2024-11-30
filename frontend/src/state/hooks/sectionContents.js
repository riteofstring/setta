import _ from "lodash";
import {
  getParamIds,
  getParamIdsToShowInArea,
} from "state/actions/sections/sectionContents";
import { useSectionInfos } from "state/definitions";
import { assembleCollectionsForSectionConfig } from "utils/codeInfoUtils";
import { useSectionCodeInfoChildren } from "./codeInfoCols";
import { useGetSectionInfo } from "./sections";
import { useSectionSelectedItem } from "./sectionVariants";

// export function useGetAllCallables(sectionId) {
//   const ids = useSectionToParamIds(
//     (x) => x.callables[sectionId] ?? [],
//     _.isEqual,
//   );
//   return useSectionInfos((x) => ids.map((id) => x.codeInfo[id]), _.isEqual);
// }

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

function useGetSelectedCollections(sectionId) {
  const codeInfoId = useGetSectionInfo(sectionId, "codeInfoId");
  return useSectionInfos(
    (x) => _.pick(x.codeInfo, x.codeInfo[codeInfoId].children),
    _.isEqual,
  );
}

export function useGetSelectedCollectionsForSectionConfig(sectionId) {
  const collections = useGetSelectedCollections(sectionId);
  return useSectionInfos(
    (x) => assembleCollectionsForSectionConfig(x.codeInfo, collections),
    _.isEqual,
  );
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

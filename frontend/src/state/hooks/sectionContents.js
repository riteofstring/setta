import C from "constants/constants.json";
import _ from "lodash";
import {
  getAllParamIds,
  getParamIds,
} from "state/actions/sections/sectionContents";
import { useCodeInfo } from "state/definitions";
import { assembleCollectionsForSectionConfig } from "utils/codeInfoUtils";
import { useGetSectionInfo } from "./sections";
import { useSectionSelectedItem } from "./sectionVariants";

// export function useGetAllCallables(sectionId) {
//   const ids = useSectionToParamIds(
//     (x) => x.callables[sectionId] ?? [],
//     _.isEqual,
//   );
//   return useCodeInfo((x) => ids.map((id) => x.x[id]), _.isEqual);
// }

export function useTopLevelParamInfos(sectionId, isPinned) {
  const selectedItem = useSectionSelectedItem(sectionId);
  const codeInfoId = useGetSectionInfo(sectionId, "codeInfoId");

  return useCodeInfo(
    (x) =>
      getParamIds(sectionId, x.x, selectedItem, codeInfoId)
        .map((id) => x.x[id])
        .filter((y) => (isPinned ? y.isPinned : !y.isPinned)),
    _.isEqual,
  );
}

export function useAreAnyParamsSelected(sectionId) {
  const selectedItem = useSectionSelectedItem(sectionId);
  const codeInfoId = useGetSectionInfo(sectionId, "codeInfoId");

  return useCodeInfo(
    (x) =>
      getAllParamIds(sectionId, x.x, selectedItem, codeInfoId)
        .map((id) => x.x[id])
        .filter((x) => x.isSelected).length > 0,
    _.isEqual,
  );
}

export function useGetParamInfosThatHaveNames(sectionId) {
  const selectedItem = useSectionSelectedItem(sectionId);
  const codeInfoId = useGetSectionInfo(sectionId, "codeInfoId");

  return useCodeInfo((x) => {
    const ids = getAllParamIds(sectionId, x.x, selectedItem, codeInfoId);
    const haveName = [];
    for (const id of ids) {
      if (x.x[id].name) {
        haveName.push(x.x[id]);
      }
    }
    return haveName;
  }, _.isEqual);
}

function useGetSelectedCollections(sectionId) {
  const codeInfoId = useGetSectionInfo(sectionId, "codeInfoId");
  return useCodeInfo((x) => _.pick(x.x, x.x[codeInfoId].children), _.isEqual);
}

export function useGetSelectedCollectionsForSectionConfig(sectionId) {
  const collections = useGetSelectedCollections(sectionId);
  return useCodeInfo(
    (x) => assembleCollectionsForSectionConfig(x.x, collections),
    _.isEqual,
  );
}

export function useHasParams(sectionId) {
  return useCodeInfo((x) => getParamIds(sectionId, x).length > 0);
}

export function useParamIdsToShowInArea(sectionId, isPinned) {
  const selectedItem = useSectionSelectedItem(sectionId);
  const codeInfoId = useGetSectionInfo(sectionId, "codeInfoId");

  return useCodeInfo((x) => {
    const allIdsAndPaths = getAllParamIds(
      sectionId,
      x.x,
      selectedItem,
      codeInfoId,
      (p) => p.rcType === C.PARAMETER,
    );
    const topLevelParamIds = [];
    const topLevelParamIdsSet = new Set();
    const requiredParamIds = new Set();
    for (const a of allIdsAndPaths) {
      if (
        (!x.x[a.id].isPinned && !isPinned) ||
        (x.x[a.id].isPinned && isPinned)
      ) {
        for (const p of a.path) {
          requiredParamIds.add(p);
          if (!topLevelParamIdsSet.has(a.path[0])) {
            topLevelParamIds.push(a.path[0]);
            topLevelParamIdsSet.add(a.path[0]);
          }
        }
      }
    }
    return { requiredParamIds, topLevelParamIds };
  }, _.isEqual);
}

import _ from "lodash";
import {
  getAllParamIds,
  getTopLevelParamIds,
} from "state/actions/sections/sectionContents";
import { useCodeInfo } from "state/definitions";
import { assembleCollectionsForSectionConfig } from "utils/codeInfoUtils";
import { useGetSectionInfo } from "./sections";

// export function useGetAllCallables(sectionId) {
//   const ids = useSectionToParamIds(
//     (x) => x.callables[sectionId] ?? [],
//     _.isEqual,
//   );
//   return useCodeInfo((x) => ids.map((id) => x.x[id]), _.isEqual);
// }

export function useTopLevelParamInfos(sectionId) {
  return useCodeInfo(
    (x) => getTopLevelParamIds(sectionId, x).map((id) => x.x[id]),
    _.isEqual,
  );
}

export function useAreAnyParamsSelected(sectionId) {
  return useCodeInfo(
    (x) =>
      getAllParamIds(sectionId, x)
        .map((id) => x.x[id])
        .filter((x) => x.isSelected).length > 0,
    _.isEqual,
  );
}

export function useGetParamInfosThatHaveNames(sectionId) {
  return useCodeInfo((x) => {
    const ids = getAllParamIds(sectionId, x);
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
  return useCodeInfo((x) => getTopLevelParamIds(sectionId, x).length > 0);
}

import _ from "lodash";
import { useSectionInfos } from "state/definitions";

export function useGetSectionInfo(sectionId, key) {
  const equalityFn = [
    "variantIds",
    "nonPresetUITypeIds",
    "paramSweepIds",
  ].includes(key)
    ? _.isEqual
    : undefined;
  return useSectionInfos((x) => x.x[sectionId][key], equalityFn);
}

export function useSectionInfoNames() {
  return useSectionInfos((x) => _.mapValues(x.x, (y) => y.name), _.isEqual);
}

export function useSectionHasMultipleVariants(sectionId) {
  return useSectionInfos((x) => x.x[sectionId].variantIds.length > 1);
}

export function useTempHasNested(sectionId) {
  return useSectionInfos((x) => x.dndChildren[sectionId]?.length > 0);
}

export function useHasPermanentNested(sectionId) {
  const variantId = useSectionInfos((x) => x.x[sectionId]?.variantId);
  return useSectionInfos((x) =>
    variantId ? x.variants[variantId].children.length > 0 : false,
  );
}

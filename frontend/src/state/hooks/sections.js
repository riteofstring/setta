import { useDndChildren } from "forks/dnd-kit/dndChildren";
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

export function useHasTempNested(sectionId) {
  return useDndChildren((x) => x.x[sectionId]?.length > 0);
}

export function useHasPermanentNested(sectionId) {
  return useSectionInfos((x) => {
    const variantId = x.x[sectionId].variantId;
    return variantId ? x.variants[variantId].children.length > 0 : false;
  });
}

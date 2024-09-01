import { useDndChildren } from "forks/dnd-kit/dndChildren";
import _ from "lodash";
import { useSectionInfos, useSectionVariants } from "state/definitions";
import {
  getMappedSectionDBSource,
  getSectionDBSource,
} from "state/getters/sectionInfo";

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

export function useSectionDBSource(sectionId) {
  return useSectionInfos((x) => getSectionDBSource(sectionId, x.x));
}

export function useMappedSectionDBSource(sectionId) {
  return useSectionInfos((x) => getMappedSectionDBSource(sectionId, x.x));
}

export function useSectionDBSourceIsAvailable(sectionId) {
  const dbSource = useMappedSectionDBSource(sectionId);
  return useSectionVariants((x) => dbSource in x.x);
}

export function useTempHasNested(sectionId) {
  return useDndChildren((x) => x.x[sectionId]?.length > 0);
}

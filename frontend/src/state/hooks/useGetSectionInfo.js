import _ from "lodash";
import { useEVCols } from "state/definitions/evCols";
import { useSectionInfos } from "state/definitions/sectionInfos";
import {
  getMappedSectionDBSource,
  getSectionDBSource,
} from "state/getters/sectionInfo";

export function useGetSectionInfo(sectionId, key) {
  const equalityFn = [
    "children",
    "size",
    "evColIds",
    "nonPresetUITypeIds",
  ].includes(key)
    ? _.isEqual
    : undefined;
  return useSectionInfos((x) => x.x[sectionId][key], equalityFn);
}

export function useSectionInfoNames() {
  return useSectionInfos((x) => _.mapValues(x.x, (y) => y.name), _.isEqual);
}

export function useSectionHasMultipleEVCols(sectionId) {
  return useSectionInfos((x) => x.x[sectionId].evColIds.length > 1);
}

export function useSectionDBSource(sectionId) {
  return useSectionInfos((x) => getSectionDBSource(sectionId, x));
}

export function useMappedSectionDBSource(sectionId) {
  return useSectionInfos((x) => getMappedSectionDBSource(sectionId, x));
}

export function useSectionDBSourceIsAvailable(sectionId) {
  const dbSource = useMappedSectionDBSource(sectionId);
  return useEVCols((x) => dbSource in x.x);
}

import C from "constants/constants.json";
import _ from "lodash";
import { useEVCols } from "state/definitions/evCols";
import { useSectionInfos } from "state/definitions/sectionInfos";
import { DB_SOURCE_MAPPING } from "utils/constants";

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
  return useSectionInfos((x) => x.x[sectionId].dbSource || C.DEFAULT_DB_ALIAS);
}

export function useMappedSectionDBSource(sectionId) {
  return useSectionInfos(
    (x) => DB_SOURCE_MAPPING[x.x[sectionId].dbSource || C.DEFAULT_DB_ALIAS],
  );
}

export function useSectionDBSourceIsAvailable(sectionId) {
  const dbSource = useMappedSectionDBSource(sectionId);
  return useEVCols((x) => dbSource in x.x);
}

import _ from "lodash";
import { useParamInfos } from "models/info/paramInfos";
import { useSectionInfos } from "models/info/sectionInfos";
import { C, DB_SOURCE_MAPPING } from "utils/constants";
import { SectionType } from "z_utils/types/section";

export function useGetSectionInfo<K extends keyof SectionType>(
  sectionId: string,
  key: K,
) {
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
  return useParamInfos((x) => dbSource in x.x);
}

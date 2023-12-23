import _ from "lodash";
import { useSectionInfos } from "models/info/sectionInfos";
import { SectionType } from "z_utils/types/section";

export function useGetSectionInfo<K extends keyof SectionType>(
  sectionId: string,
  key: K
) {
  const equalityFn = [
    "children",
    "currChildren",
    "size",
    "evColIds",
    "nonPresetUITypeIds",
  ].includes(key)
    ? _.isEqual
    : undefined;
  return useSectionInfos((x) => x.x[sectionId][key], equalityFn);
}

export function useGetManySectionInfos<K extends keyof SectionType>(
  sectionIds: string[],
  key: K
) {
  return useSectionInfos(
    (x) => sectionIds.map((id) => x.x[id][key]),
    _.isEqual
  );
}

export function useSectionInfoNames() {
  return useSectionInfos((x) => _.mapValues(x.x, (y) => y.name), _.isEqual);
}

export function useSomeSectionInfoNames(sectionIds: string[]) {
  return useSectionInfos((x) => sectionIds.map((y) => x.x[y].name), _.isEqual);
}

export function useSectionInfoIdNamePairs() {
  return useSectionInfos(
    (x) => _.map(x.x, (y) => ({ id: y.id, name: y.name })),
    _.isEqual
  );
}

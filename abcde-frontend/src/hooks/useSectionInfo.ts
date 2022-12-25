import { SectionType } from "abcde-utils/src/types/section";
import _ from "lodash";
import { useSectionInfos } from "models/info/sectionInfos";

export function useGetSectionInfo<K extends keyof SectionType>(
  sectionId: string,
  key: K
) {
  return useSectionInfos((x) => x.x[sectionId][key]);
}

export function useGetManySectionInfos(sectionIds, props) {
  return useSectionInfos(
    (x) => sectionIds.map((id) => props.map((name) => x.x[id]?.[name])),
    _.isEqual
  );
}

export function useSectionInfoNames() {
  return useSectionInfos((x) => _.mapValues(x.x, (y) => y.name));
}

export function useSomeSectionInfoNames(sectionIds) {
  return useSectionInfos((x) => sectionIds.map((y) => x.x[y].name));
}

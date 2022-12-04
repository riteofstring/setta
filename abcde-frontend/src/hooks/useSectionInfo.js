import _ from "lodash";
import { useSectionInfos } from "models/info/sectionInfos";

export function useGetSectionInfo(sectionId, props) {
  return useSectionInfos(
    (x) => props.map((y) => x.x[sectionId]?.[y]),
    _.isEqual
  );
}

export function useGetManySectionInfos(sectionIds, props) {
  return useSectionInfos(
    (x) => sectionIds.map((id) => props.map((y) => x.x[id]?.[y])),
    _.isEqual
  );
}

export function useSectionInfoNames() {
  return useSectionInfos((x) => _.mapValues(x.x, (y) => y.name));
}

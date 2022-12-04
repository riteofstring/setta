import { useStoreState } from "easy-peasy";
import _ from "lodash";

export function useGetSectionInfo(sectionId, props) {
  return useStoreState(
    (x) => props.map((y) => x.sectionInfos.x[sectionId]?.[y]),
    _.isEqual
  );
}

export function useGetManySectionInfos(sectionIds, props) {
  return useStoreState(
    (x) => sectionIds.map((id) => props.map((y) => x.sectionInfos.x[id]?.[y])),
    _.isEqual
  );
}

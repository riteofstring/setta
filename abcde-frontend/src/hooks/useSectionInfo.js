import { useStoreState } from "easy-peasy";
import _ from "lodash";

export function useGetSectionInfo(sectionId, props) {
  return useStoreState(
    (x) => props.map((y) => x.sectionInfos.x[sectionId]?.[y]),
    _.isEqual
  );
}

export function useTopLevelSectionInfo() {
  const infos = useStoreState((x) => x.sectionInfos.x);
  return topLevelSectionInfo(infos);
}

export function topLevelSectionInfo(sectionInfos) {
  return _.filter(sectionInfos, (x) => x.isTopLevel);
}

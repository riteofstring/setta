import { useStoreState } from "easy-peasy";
import _ from "lodash";
import { defaultState } from "utils/utils";

export function useGetSectionInfo(sectionId) {
  return defaultState(
    useStoreState((x) => x.sectionInfos.x[sectionId]),
    {}
  );
}

export function useTopLevelSectionInfo() {
  const infos = useStoreState((x) => x.sectionInfos.x);
  return _.filter(infos, (x) => x.isTopLevel);
}

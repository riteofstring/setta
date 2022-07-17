import { useStoreActions, useStoreState } from "easy-peasy";
import _ from "lodash";
import { defaultState } from "utils/utils";

import { getInfo } from "./utils";

export function useGetSectionInfo(sectionId) {
  return defaultState(
    useStoreState((x) => getInfo(x.sectionInfos)[sectionId]),
    () => ({})
  );
}

export function useSetSectionUITypeId(sectionId) {
  const setSectionInfoAttr = useStoreActions(
    (x) => x.sectionInfos.setSectionInfoAttr
  );
  return (uiTypeId) => {
    setSectionInfoAttr({ sectionId, attr: "uiTypeId", value: uiTypeId });
  };
}

export function useTopLevelSectionInfo() {
  const infos = useStoreState((x) => x.sectionInfos.x);
  return _.filter(infos, (x) => x.isTopLevel);
}

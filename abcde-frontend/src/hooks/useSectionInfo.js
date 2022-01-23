import { useStoreActions, useStoreState } from "easy-peasy";
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

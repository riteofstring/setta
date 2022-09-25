import { useStoreActions, useStoreState } from "easy-peasy";
import { defaultState } from "utils/utils";
import { useGetSectionInfo } from "./useSectionInfo";
import { getInfo } from "./utils";

export function getFnSetSectionUITypeId(configId, setSectionConfigAttr) {
  return (uiTypeId) =>
    setSectionConfigAttr({ configId, attr: "uiTypeId", value: uiTypeId });
}

export function useGetSectionConfig(sectionId) {
  const configId = useGetSectionInfo(sectionId).configId;
  return defaultState(
    useStoreState((x) => getInfo(x.sectionConfigs)[configId]),
    () => ({})
  );
}

export function useSetSectionUITypeId(sectionId) {
  const configId = useGetSectionInfo(sectionId).configId;
  const setSectionConfigAttr = useStoreActions(
    (x) => x.sectionConfigs.setSectionConfigAttr
  );
  return getFnSetSectionUITypeId(configId, setSectionConfigAttr);
}

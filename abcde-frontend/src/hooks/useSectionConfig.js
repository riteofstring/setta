import { useStoreActions, useStoreState } from "easy-peasy";
import { defaultState } from "utils/utils";
import { useGetSectionInfo } from "./useSectionInfo";
import { getInfo } from "./utils";

export function getFnSetSectionConfigAttr(
  configId,
  attr,
  setSectionConfigAttr
) {
  return (value) => setSectionConfigAttr({ configId, attr, value });
}

export function useGetSectionConfig(sectionId) {
  const configId = useGetSectionInfo(sectionId).configId;
  return defaultState(
    useStoreState((x) => getInfo(x.sectionConfigs)[configId]),
    () => ({})
  );
}

export function useSetSectionConfigAttr(sectionId, attr) {
  const configId = useGetSectionInfo(sectionId).configId;
  const setSectionConfigAttr = useStoreActions(
    (x) => x.sectionConfigs.setSectionConfigAttr
  );
  return getFnSetSectionConfigAttr(configId, attr, setSectionConfigAttr);
}

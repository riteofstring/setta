import { useStoreActions, useStoreState } from "easy-peasy";
import { defaultState } from "utils/utils";
import { useGetSectionInfo } from "./useSectionInfo";

export function useGetSectionConfig(sectionId) {
  const configId = useGetSectionInfo(sectionId).configId;
  return defaultState(
    useStoreState((x) => x.sectionConfigs.x[configId]),
    () => ({})
  );
}

export function useSetSectionConfigAttr(sectionId, attr) {
  const configId = useGetSectionInfo(sectionId).configId;
  const setSectionConfigAttr = useStoreActions(
    (x) => x.sectionConfigs.setSectionConfigAttr
  );
  return (value) => setSectionConfigAttr({ configId, attr, value });
}

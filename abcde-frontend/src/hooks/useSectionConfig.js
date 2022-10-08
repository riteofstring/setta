import { useStoreActions, useStoreState } from "easy-peasy";
import { useGetSectionInfo } from "./useSectionInfo";

export function getFnSetSectionConfigAttr(
  configId,
  attr,
  setSectionConfigAttr
) {
  return (value) => setSectionConfigAttr({ configId, attr, value });
}

export function useGetSectionConfig(sectionId) {
  return useStoreState((x) => x.sectionInfos.sectionConfig(sectionId));
}

export function useSetSectionConfigAttr(sectionId, attr) {
  const configId = useGetSectionInfo(sectionId).configId;
  const setSectionConfigAttr = useStoreActions(
    (x) => x.sectionConfigs.setSectionConfigAttr
  );
  return getFnSetSectionConfigAttr(configId, attr, setSectionConfigAttr);
}

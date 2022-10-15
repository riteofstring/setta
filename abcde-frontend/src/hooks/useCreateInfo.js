import { SectionConfig, SectionInfo } from "classes/mutableInfo";
import { useStoreActions } from "easy-peasy";
import { DEFAULT_SECTION_UI_TYPE_ID } from "utils/constants";

export function createManySectionInfo({
  sectionInfoProps,
  sectionConfigProps,
  numChildren,
}) {
  const newInfos = {};
  const newConfigs = {};
  for (let i = 0; i < numChildren; i++) {
    const sectionInfo = new SectionInfo(sectionInfoProps);
    const { id, configId } = sectionInfo;
    newInfos[id] = sectionInfo;
    newConfigs[configId] = new SectionConfig({
      id: configId,
      ...sectionConfigProps,
    });
  }
  return { newInfos, newConfigs };
}

export function useCreateDefaultSectionInfo() {
  const setSectionInfo = useStoreActions((x) => x.sectionInfos.setSectionInfo);
  const setSectionConfig = useStoreActions(
    (x) => x.sectionConfigs.setSectionConfig
  );
  return (sectionInfoProps, sectionConfigProps) => {
    const sectionInfo = new SectionInfo({
      name: "New Section",
      ...sectionInfoProps,
    });
    const sectionConfig = new SectionConfig({
      id: sectionInfo.configId,
      uiTypeId: DEFAULT_SECTION_UI_TYPE_ID,
      ...sectionConfigProps,
    });
    const { id, configId } = sectionInfo;
    setSectionInfo((x) => ({ ...x, [id]: sectionInfo }));
    setSectionConfig((x) => ({ ...x, [configId]: sectionConfig }));
    return [id];
  };
}

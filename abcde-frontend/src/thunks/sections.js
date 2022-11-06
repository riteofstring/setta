import { SectionConfig, SectionInfo } from "classes/mutableInfo";
import { thunk } from "easy-peasy";
import { DEFAULT_SECTION_UI_TYPE_ID } from "utils/constants";

function getSectionConfigId(s, sectionId) {
  return s.sectionInfos.x[sectionId]?.configId;
}

export function getSectionType(s, sectionId) {
  const configId = getSectionConfigId(s, sectionId);
  const sectionTypeId = s.sectionConfigs.x[configId].uiTypeId;
  return s.uiTypes.x[sectionTypeId];
}

export function getSectionConfig(s, sectionId) {
  return getSectionType(s, sectionId).config;
}

export const setSectionConfigAttr = thunk((action, payload, helpers) => {
  const { sectionId, attr, value } = payload;
  const s = helpers.getStoreState();
  const a = helpers.getStoreActions();

  const configId = getSectionConfigId(s, sectionId);
  a.sectionConfigs.setSectionConfigAttr({ configId, attr, value });
});

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

export const createDefaultSectionInfo = thunk((actions, payload, helpers) => {
  const { sectionProps, configProps } = payload;
  const a = helpers.getStoreActions();

  const sectionInfo = new SectionInfo({
    name: "New Section",
    ...sectionProps,
  });
  const sectionConfig = new SectionConfig({
    id: sectionInfo.configId,
    uiTypeId: DEFAULT_SECTION_UI_TYPE_ID,
    ...configProps,
  });
  const { id, configId } = sectionInfo;

  a.sectionInfos.setSectionInfo((x) => ({ ...x, [id]: sectionInfo }));
  a.sectionConfigs.setSectionConfig((x) => ({
    ...x,
    [configId]: sectionConfig,
  }));
  return [id];
});

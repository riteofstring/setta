import { newSectionConfig, newSectionInfo } from "classes/mutableInfo";
import { thunk } from "easy-peasy";
import { DEFAULT_SECTION_UI_TYPE_ID } from "utils/constants";

function getSectionConfigId(s, sectionId) {
  return s.sectionInfos.x[sectionId]?.configId;
}

export function getSectionConfig(s, sectionId) {
  const configId = getSectionConfigId(s, sectionId);
  return s.sectionConfigs.x[configId];
}

export function getSectionType(s, sectionId) {
  const config = getSectionConfig(s, sectionId);
  const sectionTypeId = config.uiTypeId;
  return s.uiTypes.x[sectionTypeId];
}

export function getSectionTypeConfig(s, sectionId) {
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
    const sectionInfo = newSectionInfo(sectionInfoProps);
    const { id, configId } = sectionInfo;
    newInfos[id] = sectionInfo;
    newConfigs[configId] = newSectionConfig({
      id: configId,
      ...sectionConfigProps,
    });
  }
  return { newInfos, newConfigs };
}

export const createDefaultSectionInfo = thunk((actions, payload, helpers) => {
  const { sectionProps, configProps } = payload;
  const a = helpers.getStoreActions();

  const sectionInfo = newSectionInfo({
    name: "New Section",
    ...sectionProps,
  });
  const sectionConfig = newSectionConfig({
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

export const setCurrChildren = thunk((actions, payload, helpers) => {
  const { sectionId, currChildren } = payload;
  const s = helpers.getStoreState();
  const a = helpers.getStoreActions();
  a.sectionInfos.setCurrChildren({ sectionId, currChildren });
  const sectionType = getSectionType(s, sectionId);
  a.sectionInfos.setCurrChildrenNames({ currChildren, sectionType });
});

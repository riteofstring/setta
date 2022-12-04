import { newSectionConfig, newSectionInfo } from "classes/mutableInfo";
import { thunk } from "easy-peasy";
import { useSectionConfigs } from "models/info/sectionConfigs";
import { useSectionInfos } from "models/info/sectionInfos";
import { useUITypes } from "models/info/uiTypes";
import { DEFAULT_SECTION_UI_TYPE_ID } from "utils/constants";

function getSectionConfigId(sectionId) {
  return useSectionInfos.getState().x[sectionId]?.configId;
}

export function getSectionConfig(sectionId) {
  const configId = getSectionConfigId(sectionId);
  return useSectionConfigs.getState().x[configId];
}

export function getSectionType(sectionId) {
  const config = getSectionConfig(sectionId);
  const sectionTypeId = config.uiTypeId;
  return useUITypes.getState().x[sectionTypeId];
}

export function getSectionTypeConfig(sectionId) {
  return getSectionType(sectionId).config;
}

export function setSectionConfigAttr({ sectionId, attr, value }) {
  const configId = getSectionConfigId(sectionId);
  useSectionConfigs.getState().setSectionConfigAttr({ configId, attr, value });
}

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

  useSectionInfos
    .getState()
    .setSectionInfo((x) => ({ ...x, [id]: sectionInfo }));
  useSectionConfigs.getState().setSectionConfig((x) => ({
    ...x,
    [configId]: sectionConfig,
  }));
  return [id];
});

export const setCurrChildren = thunk((actions, payload, helpers) => {
  const { sectionId, currChildren } = payload;
  const sectionInfosState = useSectionInfos.getState();
  sectionInfosState.setCurrChildren({ sectionId, currChildren });
  const sectionType = getSectionType(sectionId);
  sectionInfosState.setCurrChildrenNames({ currChildren, sectionType });
});

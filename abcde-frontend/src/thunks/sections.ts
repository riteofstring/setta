import { DEFAULT_SECTION_UI_TYPE_ID } from "abcde-utils/src/constants";
import { newSectionConfig } from "abcde-utils/src/objs/sectionConfig";
import { newSectionInfo } from "abcde-utils/src/objs/sectionInfo";
import { ManySectionType } from "abcde-utils/src/types/section";
import { ManySectionConfigType } from "abcde-utils/src/types/sectionConfig";
import { SectionUITypeConfigType } from "abcde-utils/src/types/uiType";
import _ from "lodash";
import { useCodeInfo } from "models/info/codeInfo";
import { useKwargCols } from "models/info/kwargCols";
import { useParamInfos } from "models/info/paramInfos";
import { useSectionConfigs } from "models/info/sectionConfigs";
import { useSectionInfos } from "models/info/sectionInfos";
import { useUITypes } from "models/info/uiTypes";
import { initializeParam } from "./initializeParam";

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
  return getSectionType(sectionId).config as SectionUITypeConfigType;
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
    newInfos[sectionInfo.id] = sectionInfo;
    newConfigs[sectionInfo.configId] = newSectionConfig({
      id: sectionInfo.configId,
      ...sectionConfigProps,
    });
  }
  return { newInfos, newConfigs };
}

export function createDefaultSectionInfo({ sectionProps, configProps }) {
  const sectionInfo = newSectionInfo({
    name: "New Section",
    ...sectionProps,
  });
  const sectionConfig = newSectionConfig({
    id: sectionInfo.configId,
    uiTypeId: DEFAULT_SECTION_UI_TYPE_ID,
    ...configProps,
  });

  addSectionsToState(
    { [sectionInfo.id]: sectionInfo },
    { [sectionConfig.id]: sectionConfig }
  );

  return [sectionInfo.id];
}

export function setCurrChildren({ sectionId, currChildren }) {
  const sectionInfosState = useSectionInfos.getState();
  sectionInfosState.setCurrChildren({ sectionId, currChildren });
  const sectionType = getSectionType(sectionId);
  sectionInfosState.setCurrChildrenNames({ currChildren, sectionType });
}

export function addSectionsToState(
  sectionInfos: ManySectionType,
  sectionConfigs: ManySectionConfigType
) {
  const siState = useSectionInfos.getState();
  siState.setSectionInfo((x) => ({ ...x, ...sectionInfos }));

  const sectionIds = _.map(sectionInfos, (x) => x.id);
  siState.initManyAllChildren({ sectionIds });
  siState.initManyCurrChildren({ sectionIds });

  useSectionConfigs.getState().setSectionConfig((x) => ({
    ...x,
    ...sectionConfigs,
  }));

  useParamInfos.getState().initManyEvColIds({
    collectionIds: _.map(sectionConfigs, (x) => x.evColId),
  });

  useKwargCols.getState().initManyKwargColIds({
    collectionIds: _.map(sectionConfigs, (x) => x.kwargColId),
  });
}

export function setSelectedItem(sectionId, selectedItem) {
  setSectionConfigAttr({
    sectionId,
    attr: "selectedItem",
    value: selectedItem,
  });
  const { kwargColId } = getSectionConfig(sectionId);
  useKwargCols
    .getState()
    .initObjInfoId({ collectionId: kwargColId, objInfoId: selectedItem });

  const params = useCodeInfo.getState().params[selectedItem];
  initializeParam(sectionId, params);
}

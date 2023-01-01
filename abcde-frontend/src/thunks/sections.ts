import { SectionUITypeConfigType } from "abcde-utils/src/types/uiType";
import { useCodeInfo } from "models/info/codeInfo";
import { useKwargCols } from "models/info/kwargCols";
import { useSectionConfigs } from "models/info/sectionConfigs";
import { useSectionInfos } from "models/info/sectionInfos";
import { useUITypes } from "models/info/uiTypes";
import { initializeParam } from "./initializeParam";

function getSectionConfigId(sectionId) {
  return useSectionInfos.getState().x[sectionId].configId;
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

export function setCurrChildren({ sectionId, currChildren }) {
  const sectionInfosState = useSectionInfos.getState();
  sectionInfosState.setCurrChildren({ sectionId, currChildren });
  const sectionType = getSectionType(sectionId);
  sectionInfosState.setCurrChildrenNames({ currChildren, sectionType });
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

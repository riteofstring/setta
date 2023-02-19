import { DECK, INFO, isRoot, OUTPUT, SOCIAL } from "abcde-utils/src/constants";
import { SectionUITypeConfigType } from "abcde-utils/src/types/uiType";
import { useCodeInfo } from "models/info/codeInfo";
import { useSectionConfigs } from "models/info/sectionConfigs";
import { useSectionInfos } from "models/info/sectionInfos";
import { useUITypes } from "models/info/uiTypes";
import { initializeParam } from "../initializeParam";

function getSectionConfigId(sectionId) {
  return useSectionInfos.getState().x[sectionId].configId;
}

export function getSectionParentId(sectionId) {
  return useSectionInfos.getState().x[sectionId].parentId;
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

export function getSectionIsRoot(sectionId) {
  return isRoot(getSectionType(sectionId).type);
}

export function getSectionTypeConfig(sectionId) {
  return getSectionType(sectionId).config as SectionUITypeConfigType;
}

export function getSectionCanHaveNested(sectionId) {
  return ![OUTPUT, INFO, SOCIAL].includes(getSectionType(sectionId).type);
}

export function getSectionCanOnlyBeChildOfDeck(sectionId) {
  return [OUTPUT, INFO, SOCIAL].includes(getSectionType(sectionId).type);
}

export function getSectionIsDeck(sectionId) {
  return getSectionType(sectionId).type === DECK;
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
  const params = useCodeInfo.getState().params[selectedItem];
  initializeParam(sectionId, params);
}

function setSectionInfoAttr(props) {
  useSectionInfos.getState().setSectionInfoAttr(props);
}

export function setSectionName(sectionId, name) {
  setSectionInfoAttr({ sectionId, attr: "name", value: name });
}

export function setSectionSize(sectionId, size) {
  setSectionInfoAttr({ sectionId, attr: "size", value: size });
}

export function setSectionParamInfoId(sectionId, paramInfoId) {
  setSectionInfoAttr({ sectionId, attr: "paramInfoId", value: paramInfoId });
}

export function setAllChildren(sectionId, newStateFn) {
  useSectionInfos.getState().setAllChildren({
    sectionId,
    newStateFn,
  });
}

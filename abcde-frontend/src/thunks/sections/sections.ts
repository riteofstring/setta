import { DECK, INFO, isRoot, OUTPUT, SOCIAL } from "abcde-utils/src/constants";
import { SectionUITypeConfigType } from "abcde-utils/src/types/uiType";
import { useSectionInfos } from "models/info/sectionInfos";
import { useUITypes } from "models/info/uiTypes";
import { maybeIncrementProjectStateVersion } from "thunks/undo";
import { initializeChildParams } from "../initializeParam";

export function getSectionInfo(sectionId) {
  return useSectionInfos.getState().x[sectionId];
}

export function getSectionParentId(sectionId) {
  return getSectionInfo(sectionId).parentId;
}

export function getSectionName(sectionId) {
  return getSectionInfo(sectionId).name;
}

export function getSectionType(sectionId) {
  const sectionTypeId = getSectionInfo(sectionId).uiTypeId;
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

export function setCurrChildren({ sectionId, currChildren }) {
  const sectionInfosState = useSectionInfos.getState();
  sectionInfosState.setCurrChildren({ sectionId, currChildren });
  const sectionType = getSectionType(sectionId);
  sectionInfosState.setCurrChildrenNames({ currChildren, sectionType });
}

export function setSelectedItem(sectionId, selectedItem, changedByUser) {
  setSectionInfoAttr({
    sectionId,
    attr: "selectedItem",
    value: selectedItem,
  });
  initializeChildParams(sectionId, [selectedItem]);
  maybeIncrementProjectStateVersion(changedByUser);
}

export function setSectionInfoAttr(props) {
  useSectionInfos.getState().setSectionInfoAttr(props);
}

export function setSectionName(sectionId, name, incrementVersion) {
  setSectionInfoAttr({ sectionId, attr: "name", value: name });
  maybeIncrementProjectStateVersion(incrementVersion);
}

export function setSectionSize(sectionId, size) {
  setSectionInfoAttr({ sectionId, attr: "size", value: size });
}

export function setSectionParamInfoId(sectionId, paramInfoId) {
  setSectionInfoAttr({ sectionId, attr: "paramInfoId", value: paramInfoId });
}

export function setSectionParentId(sectionId, parentId) {
  setSectionInfoAttr({ sectionId, attr: "parentId", value: parentId });
}

export function setAllChildren(sectionId, newStateFn) {
  useSectionInfos.getState().setAllChildren({
    sectionId,
    newStateFn,
  });
}

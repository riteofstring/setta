import { useCodeInfo } from "models/info/codeInfo";
import { useSectionInfos } from "models/info/sectionInfos";
import { initializeChildParams } from "thunks/initializeParam";
import { maybeIncrementProjectStateVersion } from "thunks/undo";
import { requestParameters } from "thunks/websocket";
import { newCodeInfo } from "z_utils/objs/codeInfo";
import { RCType } from "z_utils/types/codeInfo";
import { isUUID } from "z_utils/utils";
import { updateCurrChildren } from "./children";
import { getSectionTypeConfig } from "./getters";
import { updateCallables, updateParams } from "./sectionContents";

export function setSelectedItem(sectionId, selectedItem, changedByUser) {
  let id = selectedItem;
  if (!isUUID(id)) {
    const info = newCodeInfo({
      name: selectedItem,
      editable: false,
      rcType: RCType.CALLABLE,
    });
    const { codeInfoId } = getSectionTypeConfig(sectionId);
    useCodeInfo.getState().addCodeInfo({ info, parent: codeInfoId });
    id = info.id;
    updateCallables(sectionId);
  }

  setSectionInfoAttr({
    sectionId,
    attr: "selectedItem",
    value: id,
  });

  if (isUUID(selectedItem)) {
    setSelectedItemChildren(sectionId, id, changedByUser);
  } else {
    requestParameters(selectedItem, (x) => {
      createChildrenCodeInfo(id, x);
      setSelectedItemChildren(sectionId, id, changedByUser);
    });
  }
}

function createChildrenCodeInfo(parent, params) {
  for (const p of params) {
    const info = newCodeInfo({
      name: p.name,
      editable: false,
      rcType: RCType.PARAMETER,
      defaultVal: p.defaultVal,
    });
    useCodeInfo.getState().addCodeInfo({ info, parent });
  }
}

function setSelectedItemChildren(sectionId, selectedItem, incrementVersion) {
  initializeChildParams([sectionId], [selectedItem]);
  updateParams(sectionId);
  updateCurrChildren(sectionId);
  maybeIncrementProjectStateVersion(incrementVersion);
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
